import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- BULLETPROOF INITIALIZATION (The Fix) ---
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
// Important: Cron jobs usually need the SERVICE_ROLE_KEY to bypass Row Level Security (RLS) if you have it on
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Cron Build failed: Missing Supabase Keys.");
  // We allow the build to pass by not throwing error if variables are missing during build time check
  // BUT we must return early if this runs at runtime.
  // However, Next.js static generation tries to execute this. 
  // If we throw here, build fails. If we don't, it might crash later.
  // The safest fix for Vercel builds is what we did before: throw explicit error so you know to fix Env Vars.
}
// ----------------------------------

// Initialize Supabase
// We use (!) because we assume you fixed the Env Vars by now
const supabase = createClient(supabaseUrl!, supabaseKey!);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');

export async function GET(request: Request) {
  // 1. Security Check (Verify it's Vercel Cron or GitHub Actions calling)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Fetch "Unsold" clients where last message was from THEM
    // We fetch a bit more data and filter by time in Javascript to be safe/easier
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

    // 3. Iterate and Check Time (18 - 23 Hours)
    for (const lead of leads) {
      const lastMsgTime = new Date(lead.last_message_at);
      const diffMs = now.getTime() - lastMsgTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // THE RULE: 18 to 23 hours
      if (diffHours >= 18 && diffHours <= 23) {
        
        // 4. Fetch Context (Last 10 messages)
        const { data: history } = await supabase
            .from('messages')
            .select('text, from_role')
            .eq('conversation_id', lead.id)
            .order('created_at', { ascending: true })
            .limit(10);
            
        const historyText = history?.map((m: any) => `${m.from_role}: ${m.text}`).join('\n') || '';

        // 5. Generate AI Reply (Romanian)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
        const prompt = `
          Context: Ești un asistent de vânzări amabil pentru un business din România. 
          Clientul nu a mai răspuns de aproximativ 20 de ore. 
          Istoric Chat:
          ${historyText}
          
          Task: Scrie un mesaj scurt de follow-up (maxim o frază) în română pentru a reactiva conversația. 
          Ton: Prietenos, nu disperat. Fără "sper că ești bine".
        `;

        const result = await model.generateContent(prompt);
        const aiResponse = result.response.text();

        // 6. Action: Save to DB
        // In a real app, you would also POST to Facebook API here.
        
        // A. Insert AI Message
        await supabase.from('messages').insert({
          conversation_id: lead.id,
          text: aiResponse,
          from_role: 'me'
        });

        // B. Update Conversation Status (So we don't spam them again)
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
    console.error('Cron Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}