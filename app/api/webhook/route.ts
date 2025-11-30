import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- BULLETPROOF INITIALIZATION ---
// This checks every possible variable name so the build won't fail
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Build failed: Missing Supabase Keys.");
  // We throw an error here to stop the build and force you to fix Env Vars
  throw new Error("Supabase URL or Key is missing from Environment Variables!");
}

// We use (!) because we explicitly checked for existence above, satisfying TS
const supabase = createClient(supabaseUrl!, supabaseKey!);
// ----------------------------------

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
      return new NextResponse(challenge || '', { status: 200 });
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
        // Safety check: sometimes entry.messaging is undefined if it's a different event type
        const webhook_event = entry.messaging?.[0];
        
        if (webhook_event) {
            const sender_psid = webhook_event.sender.id;
            
            if (webhook_event.message) {
              await handleMessage(sender_psid, webhook_event.message);
            }
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
  const now = new Date().toISOString();

  // Try to find existing conversation by PSID (assuming id is PSID for this demo)
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
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    text: text,
    from_role: 'client',
    created_at: now
  });
}