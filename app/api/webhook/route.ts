import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// Remove strict Database type import to prevent 'never' errors

// Initialize client WITHOUT strict generic types for this file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token) {
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return new NextResponse(challenge, { status: 200 });
    } else {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  return new NextResponse('Bad Request', { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object === 'page') {
      
      // Iterate over each entry
      for (const entry of body.entry) {
        // Iterate over messaging events
        const webhook_event = entry.messaging?.[0];
        
        if (webhook_event) {
          const senderPsid = webhook_event.sender.id;
          
          // Check if it's a message (not a delivery receipt or read receipt)
          if (webhook_event.message) {
             const messageText = webhook_event.message.text;
             const messageId = webhook_event.message.mid;

             // 1. Upsert Conversation (Untyped client allows this now)
             const { data: conversation, error: convoError } = await supabase
              .from('conversations')
              .upsert({
                psid: senderPsid,
                status: 'active',
                last_interaction_at: new Date().toISOString(),
                unread_count: 1
              } as any, { onConflict: 'psid' })
              .select()
              .single();

             if (convoError) {
                 console.error('Error upserting conversation:', convoError);
                 continue;
             }

             if (conversation) {
                 // 2. Insert Message
                 await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversation.id,
                    content: messageText || '[Attachment/Non-text]',
                    sender_type: 'user',
                    meta_message_id: messageId
                  } as any);
             }
          }
        }
      }

      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    } 

    return new NextResponse('Not a page event', { status: 404 });

  } catch (error) {
    console.error('Webhook Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
