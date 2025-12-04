import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; // Ensure you use the server client

export async function GET(request: Request) {
  // 1. Initialize Supabase
  const supabase = createClient();

  // 2. Check Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 3. Get the Token from Settings
    const { data: settings } = await supabase
        .from('settings')
        .select('meta_page_access_token')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!settings?.meta_page_access_token) {
        return NextResponse.json({ error: 'No Access Token found in Settings' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = settings.meta_page_access_token;

    // 4. Call Meta Graph API
    // Fetch conversations + nested messages
    const fbResponse = await fetch(
        `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&access_token=${PAGE_ACCESS_TOKEN}`
    );

    if (!fbResponse.ok) {
        const errText = await fbResponse.text();
        return NextResponse.json({ error: 'Meta API Error', details: errText }, { status: fbResponse.status });
    }

    const fbData = await fbResponse.json();
    const conversations = fbData.data || [];
    let processedCount = 0;

    // 5. Process Data
    for (const convo of conversations) {
        const psid = convo.participants?.data[0]?.id; // The customer ID
        if (!psid) continue;

        // Upsert Conversation
        const { data: savedConvo, error: convoError } = await supabase
            .from('conversations')
            .upsert({
                psid: psid,
                status: 'active', // Default status
                last_interaction_at: convo.updated_time,
                // We use 'as any' here if you have strict type issues, 
                // but usually the DB columns match the JSON logic.
            }, { onConflict: 'psid' })
            .select()
            .single();

        if (convoError) {
            console.error('Convo Save Error:', convoError);
            continue;
        }

        // Upsert Messages (Last 25 usually returned by default)
        const messages = convo.messages?.data || [];
        for (const msg of messages) {
            await supabase.from('messages').upsert({
                conversation_id: savedConvo.id,
                content: msg.message,
                meta_message_id: msg.id,
                sender_type: msg.from?.id === psid ? 'user' : 'page',
                created_at: msg.created_time
            }, { onConflict: 'meta_message_id' });
        }
        processedCount++;
    }

    return NextResponse.json({ success: true, synced: processedCount });

  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}