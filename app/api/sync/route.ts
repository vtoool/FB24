import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();

  // 1. Check Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Get Settings
    const { data: settings } = await supabase
        .from('settings')
        .select('meta_page_access_token')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!settings?.meta_page_access_token) {
        return NextResponse.json({ error: 'No Token in Settings' }, { status: 400 });
    }

    const token = settings.meta_page_access_token;

    // 3. Call Meta API
    // We fetch messages{from} specifically to get the sender's name
    const url = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&access_token=${token}`;
    
    const fbResponse = await fetch(url);
    const fbData = await fbResponse.json();

    if (fbData.error) {
        return NextResponse.json({ error: fbData.error }, { status: 400 });
    }

    const conversations = fbData.data || [];
    let processedCount = 0;

    for (const convo of conversations) {
        const psid = convo.participants?.data[0]?.id;
        if (!psid) continue;

        // 4. SMART NAME DETECTION
        // Default: Use the participant name from the top level
        let customerName = convo.participants?.data[0]?.name || "Unknown User";

        // Refinement: Look at the last message. 
        // If the message is NOT from the Page (it's from the user), use that name.
        // This fixes cases where the Participant list is generic.
        const messages = convo.messages?.data || [];
        const lastUserMessage = messages.find((m: any) => m.from?.id === psid);
        
        if (lastUserMessage && lastUserMessage.from?.name) {
            customerName = lastUserMessage.from.name;
        }

        // 5. Upsert Conversation (Now with Name!)
        const { data: savedConvo, error: convoError } = await supabase
            .from('conversations')
            .upsert({
                psid: psid,
                customer_name: customerName, // <--- THE MISSING FIELD
                status: 'active',
                last_interaction_at: convo.updated_time,
                unread_count: 0
            } as any, { onConflict: 'psid' })
            .select()
            .single();

        if (convoError) {
            console.error(`Error saving convo ${psid}:`, convoError);
            continue;
        }

        // 6. Upsert Messages
        if (savedConvo) {
            for (const msg of messages) {
                // Determine sender type
                const isUser = msg.from?.id === psid;
                
                await supabase.from('messages').upsert({
                    conversation_id: savedConvo.id,
                    content: msg.message || '[Attachment]',
                    meta_message_id: msg.id,
                    sender_type: isUser ? 'user' : 'page',
                    created_at: msg.created_time
                } as any, { onConflict: 'meta_message_id' });
            }
        }
        processedCount++;
    }

    return NextResponse.json({ success: true, synced: processedCount });

  } catch (error: any) {
    console.error('Sync Job Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}