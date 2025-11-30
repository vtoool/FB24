import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase (Server-side)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Verify Token for Facebook
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return new NextResponse(challenge, { status: 200 });
    } else {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }
  return new NextResponse('Bad Request', { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object === 'page') {
      // Iterate over each entry - there may be multiple if batched
      for (const entry of body.entry) {
        // Iterate over each messaging event
        const webhook_event = entry.messaging[0];
        const sender_psid = webhook_event.sender.id;
        
        if (webhook_event.message) {
          await handleMessage(sender_psid, webhook_event.message);
        }
      }
      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    } else {
      return new NextResponse('Not a page event', { status: 404 });
    }
  } catch (error) {
    console.error('Webhook Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

async function handleMessage(senderPsid: string, receivedMessage: any) {
  const text = receivedMessage.text;
  if (!text) return; // Ignore non-text messages for now

  // 1. Upsert Conversation
  // We assume 'senderPsid' maps to a conversation ID or we store PSID in the conversation table.
  // For this simplified schema, let's assume senderPsid is mapped or we create a new conversation.
  
  // NOTE: Ideally, the conversations table should have a 'facebook_psid' column. 
  // We'll use the PSID as ID for simplicity or look it up.
  
  const now = new Date().toISOString();

  // Try to find existing conversation by PSID (assuming id is PSID for this demo, or we need a lookup)
  // In a real app: SELECT id FROM conversations WHERE facebook_psid = senderPsid
  const conversationId = senderPsid; 

  const { error: upsertError } = await supabase
    .from('conversations')
    .upsert({
      id: conversationId,
      client_name: `Facebook User ${senderPsid.slice(0,4)}`, // Placeholder name
      last_message_at: now,
      last_message_by: 'client',
      snippet: text,
      has_auto_replied: false, // Reset this flag on new client message
      status: 'unsold' // Default status
    }, { onConflict: 'id' });

  if (upsertError) {
    console.error('Error upserting conversation:', upsertError);
    return;
  }

  // 2. Insert Message
  // Check for duplicate? FB has 'mid' (message id). Ideally store 'mid' in messages table to dedupe.
  // We will trust the insert for now.
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    text: text,
    from_role: 'client',
    created_at: now
  });
}