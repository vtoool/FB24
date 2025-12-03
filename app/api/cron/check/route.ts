import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { Database } from '@/types/supabase';

// 1. Define Helper Types for cleaner code
type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type MessageInsert = Database['public']['Tables']['messages']['Insert'];

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
    // 2. Fetch leads
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('status', 'needs_follow_up')
      .returns<ConversationRow[]>();

    if (error) throw error;
    
    const leads = data || [];

    if (leads.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const processedLeads = [];
    const now = new Date();

    for (const lead of leads) {
      const lastMsgTime = new Date(lead.last_interaction_at);
      const diffHours = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

      if (diffHours >= 18 && diffHours <= 23) {
        
        // 3. Fetch History
        const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', lead.id)
            .order('created_at', { ascending: true })
            .limit(10)
            .returns<MessageRow[]>();
            
        const historyText = history?.map((m) => `${m.sender_type}: ${m.content}`).join('\n') || '';

        const prompt = `
          Context: Follow up with client.
          History: ${historyText}
          Task: Write a short, friendly, 1-sentence Romanian follow-up asking if they have questions.
        `;

        const result = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: prompt,
        });
        
        // --- FIX: Removed () from .text ---
        const aiResponse = result?.text; 

        if (!aiResponse) {
            continue;
        }

        const newMessage: MessageInsert = {
          conversation_id: lead.id,
          content: aiResponse,
          sender_type: 'page',
        };

        await supabase.from('messages').insert(newMessage);

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