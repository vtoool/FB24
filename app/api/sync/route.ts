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
        .select('meta_page_access_token, meta_page_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!settings?.meta_page_access_token) {
        return NextResponse.json({ error: 'No Token in Settings' }, { status: 400 });
    }

    const token = settings.meta_page_access_token;

    // 3. PAGINATION SETUP
    const MAX_PAGES = 5; // Reduced slightly to avoid Vercel Timeouts
    let pageCount = 0;
    let totalSynced = 0;
    
    // Requesting 50 items per page
    let nextUrl = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&limit=50&access_token=${token}`;

    while (nextUrl && pageCount < MAX_PAGES) {
        const fbResponse = await fetch(nextUrl);
        const fbData = await fbResponse.json();

        if (fbData.error) break;

        const conversations = fbData.data || [];
        
        // Batch Processing
        for (const convo of conversations) {
            const psid = convo.participants?.data[0]?.id;
            if (!psid) continue;

            // Name & Last Sender Detection
            let customerName = convo.participants?.data[0]?.name || "Unknown";
            let lastMessageBy = 'user'; // Default
            
            const messages = convo.messages?.data || [];
            if (messages.length > 0) {
                // The first message in the array is usually the newest one
                const newestMsg = messages[0];
                
                // If the newest message sender ID matches the customer PSID, it's the user.
                // Otherwise, it's the Page (Agent).
                if (newestMsg.from?.id === psid) {
                    lastMessageBy = 'user';
                    // Also grab the name if available
                    if (newestMsg.from?.name) customerName = newestMsg.from.name;
                } else {
                    lastMessageBy = 'page';
                }
            }

            // Upsert Conversation
            const { data: savedConvo, error: convoError } = await supabase
                .from('conversations')
                .upsert({
                    psid: psid,
                    customer_name: customerName,
                    status: 'active', 
                    last_interaction_at: convo.updated_time,
                    last_message_by: lastMessageBy, // <--- NEW COLUMN
                    unread_count: 0
                } as any, { onConflict: 'psid' })
                .select()
                .single();

            if (convoError) continue;

            // Upsert Messages (Only newest 5 to save time/performance)
            // We don't need all 50 history messages for every sync
            if (savedConvo && messages.length > 0) {
                const recentMessages = messages.slice(0, 5); 
                const messageRows = recentMessages.map((msg: any) => ({
                    conversation_id: savedConvo.id,
                    content: msg.message || '[Attachment]',
                    meta_message_id: msg.id,
                    sender_type: msg.from?.id === psid ? 'user' : 'page',
                    created_at: msg.created_time
                }));

                await supabase.from('messages').upsert(messageRows as any, { onConflict: 'meta_message_id' });
            }
            totalSynced++;
        }

        nextUrl = fbData.paging?.next;
        pageCount++;
    }

    return NextResponse.json({ success: true, total: totalSynced });

  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}