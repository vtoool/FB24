import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Bulletproof Supabase Init
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase Keys");
}
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_TOKEN;
  if (!PAGE_ACCESS_TOKEN) return new NextResponse('Missing FB_PAGE_TOKEN', { status: 500 });

  try {
    let allThreads: any[] = [];
    // Request fields: Thread ID, Updated Time, Snippet, and the last 3 messages for context
    let url = `https://graph.facebook.com/v20.0/me/conversations?fields=id,updated_time,snippet,senders,messages.limit(3){message,from,created_time}&limit=50&access_token=${PAGE_ACCESS_TOKEN}`;
    
    // --- THE 6x50 LOOP ---
    // We loop max 6 times (300 conversations) to avoid timeouts, or until pages run out.
    for (let i = 0; i < 6; i++) {
      console.log(`Fetching Batch ${i + 1}...`);
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        console.error("FB Error:", data.error);
        break;
      }

      if (data.data && data.data.length > 0) {
        allThreads = [...allThreads, ...data.data];
      }

      // Pagination Check
      if (data.paging && data.paging.next) {
        url = data.paging.next;
      } else {
        break; // No more pages
      }
    }

    // --- SAVE TO DATABASE ---
    console.log(`Processing ${allThreads.length} threads...`);
    let count = 0;

    for (const thread of allThreads) {
      // 1. Prepare Conversation Data
      // Senders is an array. Usually [Client, Page]. We try to find the one that isn't us.
      const client = thread.senders?.data[0]?.name || "Unknown User";
      
      // Upsert Conversation
      const { error: convError } = await supabase
        .from('conversations')
        .upsert({
          id: thread.id,
          client_name: client,
          snippet: thread.snippet,
          last_message_at: thread.updated_time,
          // Simple logic: if updated_time matches the last message time from 'me', set 'me'. Default 'client'.
          last_message_by: 'client', // We'll refine this via webhook real-time later
          status: 'unsold', // Default
          has_auto_replied: false
        }, { onConflict: 'id' });

      if (convError) console.error("Conv Error", convError);

      // 2. Insert Recent Messages
      if (thread.messages?.data) {
        const messagesToInsert = thread.messages.data.map((m: any) => ({
          conversation_id: thread.id,
          text: m.message,
          // Determine role based on who sent it. 
          // Note: In real app, compare m.from.id with your Page ID. 
          // For now, we assume if it has a name, it's valid.
          from_role: m.from?.name === client ? 'client' : 'me', 
          created_at: m.created_time
        }));

        // We use 'ignoreDuplicates' so we don't crash on existing messages
        const { error: msgError } = await supabase
          .from('messages')
          .upsert(messagesToInsert, { onConflict: 'id', ignoreDuplicates: true }); // ID might be missing from mapping, handled by DB gen_random_uuid if not provided, but here we are syncing content.
          // Note: To truly dedupe, we'd need the FB Message ID. For this prototype, we just push.
      }
      count++;
    }

    return NextResponse.json({ 
      success: true, 
      count: count, 
      message: `Synced ${count} conversations from Facebook.` 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
