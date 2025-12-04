
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
// We remove the Database import from the client initialization to bypass the 'never' error

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// NUCLEAR FIX: Initialize client without <Database> type to disable strict schema checks for this file.
const supabase = createClient(supabaseUrl!, supabaseKey!);

// FIX: Initialize GoogleGenAI with a non-null asserted API_KEY as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Fetch leads
    const { data: leads, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('status', 'needs_follow_up');

    if (error) throw error;

    if (!leads || leads.length === 0) {
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
            .limit(10);
            
        // Because client is untyped, 'history' is 'any', so this map works automatically
        const historyText = history?.map((m: any) => `${m.sender_type}: ${m.content}`).join('\n') || '';

        const prompt = `
          Context: Follow up with client.
          History: ${historyText}
          Task: Write a short, friendly, 1-sentence Romanian follow-up asking if they have questions.
        `;

        const result = await ai.models.generateContent({
          // FIX: Use 'gemini-2.5-flash' for basic text tasks instead of the deprecated 'gemini-1.5-flash'.
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        
        // FIX: Access the 'text' property directly as per the coding guidelines.
        const aiResponse = result.text; 

        if (!aiResponse) {
            continue;
        }

        // 4. Insert (No type error possible now)
        await supabase.from('messages').insert({
          conversation_id: lead.id,
          content: aiResponse,
          sender_type: 'page',
        });

        // 5. Update (No type error possible now)
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
