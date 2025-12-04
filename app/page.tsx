"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client'; 
import { Conversation, Message, FilterType } from '../types';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { useRouter } from 'next/navigation';

export default function Home() {
  const supabase = createClient(); 

  const [isMounted, setIsMounted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<FilterType>('All');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch Logic
  const fetchConversations = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.warn("Dashboard: No user found.");
        return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('last_interaction_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching conversations:", error);
    } else {
      setConversations(data || []);
    }
  }, [supabase]);

  // 2. Setup Realtime Subscription
  useEffect(() => {
    fetchConversations();
    
    const channel = supabase
      .channel('crm-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const newRecord = payload.new as Conversation;
        setConversations(prev => {
           if (payload.eventType === 'DELETE') {
             return prev.filter(c => c.id !== payload.old.id);
           }
           const exists = prev.find(c => c.id === newRecord.id);
           if (exists) {
             return prev.map(c => c.id === newRecord.id ? newRecord : c)
               .sort((a,b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime());
           }
           return [newRecord, ...prev]
             .sort((a,b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime());
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
         const newMsg = payload.new as Message;
         if (selectedId === newMsg.conversation_id) {
           setMessages(prev => [...prev, newMsg]);
         }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsRealtime(true);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, fetchConversations, supabase]);

  // 3. Load Messages on Selection
  useEffect(() => {
    if (!selectedId) return;

    const loadMessages = async () => {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error("Error fetching messages:", error);
        setMessages([]);
      } else {
        setMessages(data || []);
      }
      setLoadingMessages(false);
    };
    
    loadMessages();
  }, [selectedId, supabase]);

  // 4. Filter Logic
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (filter === 'All') return true;
      if (filter === 'Needs Follow-up') return c.status === 'needs_follow_up';
      return true;
    });
  }, [conversations, filter]);

  const activeConversation = conversations.find(c => c.id === selectedId) || null;

// 5. Send Message Handler (Now with Meta API integration)
  const handleSendMessage = async (text: string) => {
    if (!selectedId || !activeConversation) return;
    
    // A. Optimistic UI Update (Instant feedback)
    const tempId = crypto.randomUUID();
    const newMsg: Message = {
      id: tempId,
      conversation_id: selectedId,
      content: text,
      sender_type: 'page',
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMsg]);
    
    try {
        // B. Get the Access Token (Required to send)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: settings } = await supabase
            .from('settings')
            .select('meta_page_access_token')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!settings?.meta_page_access_token) {
            throw new Error("No Page Access Token found in Settings");
        }

        // C. CALL META API (The missing link!)
        const psid = activeConversation.psid;
        const fbRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${settings.meta_page_access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: psid },
                messaging_type: "RESPONSE",
                message: { text: text }
            })
        });

        const fbData = await fbRes.json();
        
        if (fbData.error) {
            console.error("Meta API Error:", fbData.error);
            throw new Error(fbData.error.message || "Failed to send to Facebook");
        }

        // D. Save to Supabase (Only if Meta succeeded)
        // We use the real message ID from Facebook (fbData.message_id)
        await Promise.all([
            supabase.from('messages').insert({
                conversation_id: selectedId,
                content: text,
                sender_type: 'page',
                created_at: new Date().toISOString(),
                meta_message_id: fbData.message_id 
            }),
            supabase.from('conversations').update({
                last_interaction_at: new Date().toISOString(),
                status: 'active', // Reset status because we replied
                unread_count: 0,
                last_message_preview: text,
                last_message_by: 'page'
            }).eq('id', selectedId)
        ]);

    } catch (error: any) {
        console.error("Send Error:", error);
        alert(`Could not send message: ${error.message}`);
        // Optional: Remove the optimistic message here if you want perfect data consistency
        setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };
  
// 6. HIGH-PERFORMANCE BATCH SYNC
  const handleSync = async () => {
    setIsSyncing(true);
    const MAX_PAGES = 6; // Limit to ~300 conversations
    let pagesProcessed = 0;
    
    try {
      // A. Get Token
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: settings } = await supabase
        .from('settings')
        .select('meta_page_access_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!settings?.meta_page_access_token) {
        if (confirm('Meta Access Token is missing. Go to settings?')) {
          router.push('/settings');
        }
        return;
      }

      const token = settings.meta_page_access_token;
      let nextUrl = `https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages{message,created_time,from,id}&limit=50&access_token=${token}`;

      while (nextUrl && pagesProcessed < MAX_PAGES) {
        console.log(`Fetching Page ${pagesProcessed + 1}...`);
        
        const fbRes = await fetch(nextUrl);
        const fbData = await fbRes.json();
        
        if (fbData.error) throw new Error(fbData.error.message);

        const conversationsData = fbData.data || [];
        
        // --- BATCH PREPARATION ---
        const convoBatch: any[] = [];
        const msgBatch: any[] = [];

        for (const convo of conversationsData) {
           const psid = convo.participants?.data[0]?.id;
           if (!psid) continue;

           // Calculate Metadata Locally
           let customerName = convo.participants?.data[0]?.name || "Unknown";
           let lastMessageBy = 'user';
           let lastMessagePreview = '';
           
           const msgs = convo.messages?.data || [];
           if (msgs.length > 0) {
             const newest = msgs[0];
             lastMessagePreview = newest.message || '[Attachment]';
             
             if (newest.from?.id === psid) {
               lastMessageBy = 'user';
               if (newest.from?.name) customerName = newest.from.name;
             } else {
               lastMessageBy = 'page';
             }
           }

           // Add to Conversation Batch
           convoBatch.push({
                psid: psid,
                customer_name: customerName,
                status: 'active',
                last_interaction_at: convo.updated_time,
                last_message_by: lastMessageBy,
                last_message_preview: lastMessagePreview,
                unread_count: 0
           });

           // Add to Message Batch (Limit 5 newest per convo to keep payload light)
           if (msgs.length > 0) {
             const recent = msgs.slice(0, 5).map((m: any) => ({
                // We need to fetch the conversation ID later, but for bulk insert
                // we can rely on Supabase upserting the conversation first.
                // However, without the UUID, we need a strategy.
                // STRATEGY: We insert conversations, then fetch their IDs map, then insert messages.
                // For simplicity/speed in client-side sync, we might have to query specific IDs if we don't have them.
                // optimization: upsert returns data.
                
                // TEMP FIX: To do true bulk insert of messages, we need the conversation UUIDs.
                // Since 'psid' is unique, we can rely on that if we had a join, but we don't.
                // So we will do 1 Bulk Request for Conversations, get the IDs back, then 1 Bulk for Messages.
                temp_psid: psid, // Helper to link back
                content: m.message || '[Attachment]',
                meta_message_id: m.id,
                sender_type: m.from?.id === psid ? 'user' : 'page',
                created_at: m.created_time
             }));
             msgBatch.push(...recent);
           }
        }

        // --- BULK EXECUTION ---
        if (convoBatch.length > 0) {
            // 1. Bulk Upsert Conversations & Return IDs
            const { data: savedConvos, error: convoError } = await supabase
                .from('conversations')
                .upsert(convoBatch, { onConflict: 'psid' })
                .select('id, psid'); // Get the UUIDs back

            if (convoError) {
                console.error("Batch Convo Error", convoError);
                continue;
            }

            // 2. Map Message Batch to correct Conversation UUIDs
            if (savedConvos && msgBatch.length > 0) {
                const idMap = new Map(savedConvos.map(c => [c.psid, c.id]));
                
                const finalMsgBatch = msgBatch.map(m => ({
                    conversation_id: idMap.get(m.temp_psid), // Link using the map
                    content: m.content,
                    meta_message_id: m.meta_message_id,
                    sender_type: m.sender_type,
                    created_at: m.created_at
                })).filter(m => m.conversation_id); // Safety check

                // 3. Bulk Upsert Messages
                if (finalMsgBatch.length > 0) {
                    await supabase.from('messages').upsert(finalMsgBatch, { onConflict: 'meta_message_id' });
                }
            }
        }

        await fetchConversations(); // Update UI
        
        nextUrl = fbData.paging?.next;
        pagesProcessed++;
      }

    } catch (error: any) {
      console.error(error);
      alert(`Sync Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex h-screen w-screen bg-background overflow-hidden">
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full flex-col border-r border-border`}>
        <Sidebar 
          conversations={filteredConversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filter={filter}
          setFilter={setFilter}
          isSyncing={isSyncing}
          onSync={handleSync}
        />
      </div>
      
      <div className={`${!selectedId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
        <ChatWindow 
          conversation={activeConversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          loading={loadingMessages}
        />
      </div>
    </main>
  );
}