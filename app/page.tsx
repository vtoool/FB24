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

  // 5. Send Message Logic
  const handleSendMessage = async (text: string) => {
    if (!selectedId) return;
    
    const newMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: selectedId,
      content: text,
      sender_type: 'page',
      created_at: new Date().toISOString()
    };
    
    // Optimistic Update
    setMessages(prev => [...prev, newMsg]);
    setConversations(prev => prev.map(c => 
      c.id === selectedId 
        ? { ...c, last_interaction_at: newMsg.created_at, status: 'active' as const, unread_count: 0, last_message_preview: text } 
        : c
    ).sort((a,b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime()));

    // DB Update
    await Promise.all([
        supabase.from('messages').insert({
            conversation_id: selectedId,
            content: text,
            sender_type: 'page',
            created_at: newMsg.created_at
        }),
        supabase.from('conversations').update({
            last_interaction_at: newMsg.created_at,
            status: 'active',
            unread_count: 0
        }).eq('id', selectedId)
    ]);
  };
  
  // 6. CLIENT-SIDE SYNC ENGINE (Direct Browser Fetch)
  const handleSync = async () => {
    setIsSyncing(true);
    const MAX_PAGES = 6; // Fetch ~300 conversations
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

      // B. The Loop
      while (nextUrl && pagesProcessed < MAX_PAGES) {
        console.log(`Syncing Page ${pagesProcessed + 1}...`);
        
        // Direct fetch to Facebook (No Vercel Timeout)
        const fbRes = await fetch(nextUrl);
        const fbData = await fbRes.json();
        
        if (fbData.error) throw new Error(fbData.error.message);

        const conversationsData = fbData.data || [];
        
        // Process Locally
        for (const convo of conversationsData) {
           const psid = convo.participants?.data[0]?.id;
           if (!psid) continue;

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

           // Upsert Conversation
           const { data: savedConvo } = await supabase
             .from('conversations')
             .upsert({
                psid: psid,
                customer_name: customerName,
                status: 'active',
                last_interaction_at: convo.updated_time,
                last_message_by: lastMessageBy,
                last_message_preview: lastMessagePreview,
                unread_count: 0
             } as any, { onConflict: 'psid' })
             .select()
             .single();
            
           // Upsert Messages (Batch newest 5)
           if (savedConvo && msgs.length > 0) {
             const recent = msgs.slice(0, 5).map((m: any) => ({
                conversation_id: savedConvo.id,
                content: m.message || '[Attachment]',
                meta_message_id: m.id,
                sender_type: m.from?.id === psid ? 'user' : 'page',
                created_at: m.created_time
             }));
             
             await supabase.from('messages').upsert(recent as any, { onConflict: 'meta_message_id' });
           }
        }

        // Refresh UI immediately
        await fetchConversations();
        
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