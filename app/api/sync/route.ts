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

    // 3. Debug: Call Meta API
    const url = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&access_token=${token}`;
    
    const fbResponse = await fetch(url);
    const fbData = await fbResponse.json();

    // 4. CRITICAL: Return raw data to user to see what is happening
    if (fbData.error) {
        return NextResponse.json({ 
            status: "Meta API Failed", 
            error: fbData.error 
        }, { status: 400 });
    }

    // 5. Process if data exists
    const conversations = fbData.data || [];
    const logs = [];

    for (const convo of conversations) {
        const psid = convo.participants?.data[0]?.id;
        if (!psid) {
            logs.push(`Skipped convo (No PSID): ${convo.id}`);
            continue;
        }

        const { error } = await supabase.from('conversations').upsert({
            psid: psid,
            status: 'active',
            last_interaction_at: convo.updated_time,
            unread_count: 0
        } as any, { onConflict: 'psid' });

        if (error) {
            logs.push(`DB Error for ${psid}: ${error.message}`);
        } else {
            logs.push(`Success for ${psid}`);
        }
    }

    return NextResponse.json({ 
        success: true, 
        meta_response_summary: {
            total_found: conversations.length,
            raw_data_preview: conversations.slice(0, 2) // Show first 2 convos
        },
        database_logs: logs
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}