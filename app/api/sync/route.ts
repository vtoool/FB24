
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = createClient();

  try {
    // 1. Authenticate & Get Settings
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      // For the sake of the demo, if no auth, we cannot access settings securely.
      // However, if running locally without auth UI, we might fallback.
      // Assuming Auth is required for this new polling architecture:
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('meta_page_access_token')
      .eq('user_id', user.id)
      .single();

    if (!settings?.meta_page_access_token) {
      return NextResponse.json({ 
        error: "Missing Meta Access Token. Please configure it in Settings.",
        code: "MISSING_TOKEN"
      }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = settings.meta_page_access_token;

    // 2. Get Page ID (to determine "Me")
    const meRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${PAGE_ACCESS_TOKEN}`);
    const meData = await meRes.json();
    
    if (meData.error) {
      throw new Error(`Meta API Error: ${meData.error.message}`);
    }
    
    const PAGE_ID = meData.id;

    // 3. Fetch Conversations with Messages
    let allThreads: any[] = [];
    let url = `https://graph.facebook.com/v19.0/me/conversations?fields=id,updated_time,snippet,senders,messages.limit(20){message,from,created_time,id}&limit=50&access_token=${PAGE_ACCESS_TOKEN}`;
    
    // Fetch up to 3 batches
    for (let i = 0; i < 3; i++) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      if (data.data) allThreads = [...allThreads, ...data.data];
      if (data.paging?.next) url = data.paging.next; else break;
    }

    console.log(`Processing ${allThreads.length} threads for Page ID: ${PAGE_ID}...`);
    let count = 0;

    for (const thread of allThreads) {
      // Determine Customer Name (Sender that isn't the page)
      // Note: 'senders' usually includes both parties.
      const customer = thread.senders?.data.find((s: any) => s.id !== PAGE_ID);
      const customerName = customer?.name || "Unknown User";
      const psid = thread.id; 

      // 4. Determine Status based on last message
      let status: 'active' | 'needs_follow_up' = 'active';
      let lastMsgTime = thread.updated_time;

      if (thread.messages?.data && thread.messages.data.length > 0) {
        // Graph API returns messages in reverse chronological order (newest first) usually, 
        // but 'messages' edge order can vary. Safe bet: sort them.
        const sortedMsgs = [...thread.messages.data].sort((a: any, b: any) => 
          new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
        );
        
        const lastMsg = sortedMsgs[0];
        lastMsgTime = lastMsg.created_time;
        
        // LOGIC: If last message sender ID != Page ID -> needs_follow_up
        // Otherwise -> active
        if (lastMsg.from?.id !== PAGE_ID) {
          status = 'needs_follow_up';
        } else {
          status = 'active';
        }
      }

      // 5. Upsert Conversation
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .upsert({
          psid: psid,
          customer_name: customerName,
          last_interaction_at: lastMsgTime,
          status: status,
          // We don't overwrite unread_count blindly here, or we calculate it. 
          // For now, let's leave unread_count as is or default to 0 if new.
        }, { onConflict: 'psid' })
        .select()
        .single();

      if (convError || !conv) {
         console.error("Conv Error", convError);
         continue;
      }

      // 6. Insert Messages
      if (thread.messages?.data) {
        const messagesToInsert = thread.messages.data.map((m: any) => ({
          conversation_id: conv.id,
          content: m.message || '[Attachment]',
          sender_type: m.from?.id === PAGE_ID ? 'page' : 'user',
          meta_message_id: m.id,
          created_at: m.created_time
        }));

        const { error: msgError } = await supabase
          .from('messages')
          .upsert(messagesToInsert, { onConflict: 'id', ignoreDuplicates: true });
          
        if (msgError) console.error("Msg Error", msgError);
      }
      count++;
    }

    return NextResponse.json({ 
      success: true, 
      count: count, 
      message: `Synced ${count} conversations successfully.` 
    });

  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}