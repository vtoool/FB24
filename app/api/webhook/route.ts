
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// --- BULLETPROOF INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Build failed: Missing Supabase Keys.");
}

const supabase = createClient<Database>(supabaseUrl || '', supabaseKey || '');
// ----------------------------------

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
      for (const entry of body.entry) {
        const webhook_event = entry.messaging?.[0];
        
        if (webhook_event) {
            const senderPsid = webhook_event.sender.id;
            
            if (webhook_event.message && webhook_event.message.text) {
              await handleMessage(senderPsid, webhook_event.message);
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

  // 1. Upsert Conversation
  const { data: conversation, error: convoError } = await supabase
    .from('conversations')
    .upsert({
      psid: senderPsid,
      status: 'active',
      last_interaction_at: new Date().toISOString(),
      unread_count: 1, // Increment logic would go here in production
      // We do not have customer_name from this webhook event usually
    }, { onConflict: 'psid' })
    .select()
    .single();

  if (convoError || !conversation) {
    console.error('Error upserting conversation:', convoError);
    // In a real scenario, we might want to retry or throw
    return;
  }

  // 2. Insert Message using the returned conversation ID
  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: text,
    sender_type: 'user',
    meta_message_id: receivedMessage.mid || null
  });

  if (msgError) {
    console.error('Error inserting message:', msgError);
  }
}
