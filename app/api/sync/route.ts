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

    // 3. PAGINATION SETUP
    const MAX_PAGES = 6; // User requested ~300 conversations
    let pageCount = 0;
    let totalSynced = 0;
    
    // Initial URL (Requesting 50 items per page)
    let nextUrl = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&limit=50&access_token=${token}`;

    // 4. THE LOOP
    while (nextUrl && pageCount < MAX_PAGES) {
        console.log(`Fetching Page ${pageCount + 1}...`);
        
        const fbResponse = await fetch(nextUrl);
        const fbData = await fbResponse.json();

        if (fbData.error) {
            console.error("Meta API Error:", fbData.error);
            // If one page fails, we stop but don't crash the whole process
            break; 
        }

        const conversations = fbData.data || [];
        
        // Process this batch
        for (const convo of conversations) {
            const psid = convo.participants?.data[0]?.id;
            if (!psid) continue;

            // Name Detection Logic
            let customerName = convo.participants?.data[0]?.name || "Unknown User";
            const messages = convo.messages?.data || [];
            
            // Try to find a real name from the message history
            const lastUserMessage = messages.find((m: any) => m.from?.id === psid);
            if (lastUserMessage && lastUserMessage.from?.name) {
                customerName = lastUserMessage.from.name;
            }

            // Upsert Conversation
            const { data: savedConvo, error: convoError } = await supabase
                .from('conversations')
                .upsert({
                    psid: psid,
                    customer_name: customerName,
                    status: 'active', // Default status
                    last_interaction_at: convo.updated_time,
                    unread_count: 0
                } as any, { onConflict: 'psid' })
                .select()
                .single();

            if (convoError) continue;

            // Upsert Messages
            if (savedConvo && messages.length > 0) {
                const messageRows = messages.map((msg: any) => ({
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

        // Prepare for next loop
        nextUrl = fbData.paging?.next; // Meta provides the full URL for the next page
        pageCount++;
    }

    return NextResponse.json({ 
        success: true, 
        pages_processed: pageCount,
        total_conversations_synced: totalSynced 
    });

  } catch (error: any) {
    console.error('Sync Job Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}