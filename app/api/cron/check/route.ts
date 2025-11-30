import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// 1. Config
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// FIX: Per @google/genai guidelines, initialize with `apiKey` from `process.env.API_KEY`.
// Renamed `genAI` to `ai` for consistency.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function GET(req: NextRequest) {
  // 1. Security Check
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Find conversations needing follow-up
    // Criteria: status='unsold', last_message_by='client', has_auto_replied=false
    // Time: 18-23 hours ago.
    
    // Since Supabase filtering by complex date ranges can be tricky in one go, 
    // we'll fetch candidate conversations and filter date in JS, or use raw SQL.
    // Let's fetch 'unsold' + 'client' last message + 'no reply yet'.
    
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, last_message_at, client_name')
      .eq('status', 'unsold')
      .eq('last_message_by', 'client')
      .eq('has_auto_replied', false);

    if (error) throw error;
    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No conversations match criteria' });
    }

    const now = new Date();
    const processedIds: string[] = [];

    for (const conv of conversations) {
      const lastMsgTime = new Date(conv.last_message_at);
      const diffMs = now.getTime() - lastMsgTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Filter: Between 18 and 23 hours
      if (diffHours >= 18 && diffHours <= 23) {
        await processConversation(conv.id, conv.client_name);
        processedIds.push(conv.id);
      }
    }

    return NextResponse.json({ success: true, processedCount: processedIds.length, processedIds });
  } catch (err: any) {
    console.error('Cron Error:', err);
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}

async function processConversation(conversationId: string, clientName: string) {
  // 1. Fetch Context (Last 10 messages)
  const { data: messages } = await supabase
    .from('messages')
    .select('text, from_role')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Reverse to chronological order for AI
  const history = messages ? messages.reverse() : [];
  
  // Format history for prompt
  const conversationText = history.map(m => `${m.from_role === 'me' ? 'Agent' : 'Client'}: ${m.text}`).join('\n');

  // 2. Generate AI Reply
  const prompt = `
    You are a helpful sales assistant.
    Review the conversation below with a client named ${clientName}.
    The client stopped replying about 20 hours ago.
    Write a SHORT, CASUAL, and friendly follow-up message in ROMANIAN to re-engage them.
    Maximum 1 sentence. Do not sound robotic.
    
    Conversation:
    ${conversationText}
    
    Follow-up message (Romanian):
  `;

  let aiReplyText = '';
  
  try {
     const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
     });
     // FIX: Safely access `response.text` which can be undefined. Use optional chaining and nullish coalescing to prevent runtime errors.
     aiReplyText = response.text?.trim() ?? '';
  } catch (e) {
     console.error("Gemini Error", e);
     return; // Skip if AI fails
  }

  if (!aiReplyText) return;

  // 3. Send Message (Mock Facebook API Call)
  // await sendToFacebook(conversationId, aiReplyText);
  
  // 4. Save to DB
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    text: aiReplyText,
    from_role: 'me',
    created_at: new Date().toISOString()
  });

  // 5. Update Conversation Status
  await supabase.from('conversations').update({
    has_auto_replied: true,
    last_message_at: new Date().toISOString(),
    last_message_by: 'me',
    snippet: aiReplyText
  }).eq('id', conversationId);
}

// Mock function for context
// async function sendToFacebook(psid: string, text: string) {
//   const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;
//   await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       recipient: { id: psid },
//       message: { text: text }
//     })
//   });
// }