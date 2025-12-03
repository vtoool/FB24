import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { Database } from '@/types/supabase';

// Define the exact Row type to prevent 'never' inference errors
type ConversationRow = Database['public']['Tables']['conversations']['Row'];

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient<Database>(supabaseUrl!, supabaseKey!);
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 1. Fetch leads explicitly typed as ConversationRow[]
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('status', 'needs_follow_up')
      .returns<ConversationRow[]>(); // Fixes 'never' type error

    if (error) throw error;
    
    // Handle null data safely
    const leads = data || [];

    if (leads.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const processedLeads = [];
    const now = new Date();

    for (const lead of leads) {
      const lastMsgTime = new Date(lead.last_interaction_at);
      const diffHours = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

      // Simple time check (18-23h)
      if (diffHours >= 18 && diffHours <= 23) {
        
        const { data: history } = await supabase
            .from('messages')
            .select('content, sender_type')
            .eq('conversation_id', lead.id)
            .order('created_at', { ascending: true })
            .limit(10);
            
        const historyText = history?.map((m) => `${m.sender_type}: ${m.content}`).join('\n') || '';

        const prompt = `
          Context: Follow up with client.
          History: ${historyText}
          Task: Write a short, friendly, 1-sentence Romanian follow-up asking if they have questions.
        `;

        // Generate Content
        // Using gemini-2.5-flash as 1.5 is deprecated
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        
        // Correctly access text property (not a function)
        const aiResponse = result.text;

        if (!aiResponse) {
          console.log(`No response generated for lead ${lead.id}`);
          continue;
        }

        await supabase.from('messages').insert({
          conversation_id: lead.id,
          content: aiResponse,
          sender_type: 'page'
        });

        await supabase.from('conversations').update({
          last_interaction_at: new Date().toISOString(),
          status: 'active'
        }).eq('id', lead.id);

        processedLeads.push({ id: lead.id, response: aiResponse });
      }
    }

    return NextResponse.json({ success: true, processed: processedLeads });
  } catch (error: any) {
    console.error('Cron Job Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}