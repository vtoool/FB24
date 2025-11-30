import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// --- BULLETPROOF INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Cron Build failed: Missing Supabase Keys.");
  // Throwing an error is the safest way to ensure environment variables are set correctly during development/build.
}
// ----------------------------------

// Initialize Supabase
const supabase = createClient(supabaseUrl!, supabaseKey!);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function GET(request: Request) {
  // 1. Security Check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Fetch leads that need a follow-up
    const { data: leads, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('status', 'unsold')
      .eq('last_message_by', 'client')
      .eq('has_auto_replied', false);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending leads found." });
    }

    const processedLeads = [];
    const now = new Date();

    // 3. Iterate and check time window (18-23 hours)
    for (const lead of leads) {
      const lastMsgTime = new Date(lead.last_message_at);
      const diffMs = now.getTime() - lastMsgTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours >= 18 && diffHours <= 23) {
        
        // 4. Fetch message history for context
        const { data: history } = await supabase
            .from('messages')
            .select('text, from_role')
            .eq('conversation_id', lead.id)
            .order('created_at', { ascending: true })
            .limit(10);
            
        const historyText = history?.map((m: any) => `${m.from_role}: ${m.text}`).join('\n') || '';

        // 5. Generate AI reply using the updated Gemini SDK
        const prompt = `
          Context: Ești un asistent de vânzări amabil pentru un business din România. 
          Clientul nu a mai răspuns de aproximativ 20 de ore. 
          Istoric Chat:
          ${historyText}
          
          Task: Scrie un mesaj scurt de follow-up (maxim o frază) în română pentru a reactiva conversația. 
          Ton: Prietenos, nu disperat. Fără "sper că ești bine".
        `;

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        
        const aiResponse = result.text;

        if (!aiResponse) {
          console.warn(`Could not generate AI response for lead ID: ${lead.id}`);
          continue;
        }

        // 6. Save the AI message and update the conversation
        await supabase.from('messages').insert({
          conversation_id: lead.id,
          text: aiResponse,
          from_role: 'me'
        });

        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_by: 'me',
          snippet: aiResponse,
          has_auto_replied: true 
        }).eq('id', lead.id);

        processedLeads.push({ client: lead.client_name, response: aiResponse });
      }
    }

    return NextResponse.json({ success: true, processed: processedLeads });
  } catch (error: any) {
    console.error('Cron Job Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}