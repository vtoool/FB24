"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
// FIX 1: Import the generator function, NOT the static instance
import { createClient } from '@/utils/supabase/client'; 
import { Conversation, Message, FilterType } from '@/types'; // Adjusted import to use alias if needed, or '../types'
import { Sidebar } from '@/components/Sidebar';
import { ChatWindow } from '@/components/ChatWindow';
import { useRouter } from 'next/navigation';

export default function Home() {
  // FIX 2: Initialize the client *inside* the component
  // This ensures it grabs the current browser cookies (your login session)
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

  const fetchConversations = useCallback(async () => {
    // Check Auth: Ensure we are actually logged in before asking for data
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.warn("Dashboard: No user found. RLS will block data.");
        // Optional: router.push('/login');
        return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('last_interaction_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching conversations:", error);
    } else {
      console.log(`Dashboard: Loaded ${data?.length || 0} conversations`); // Debug log
      setConversations(data || []);
    }
  }, [supabase]);

  // 1. Fetch Conversations & Setup Realtime
  useEffect(() => {
    fetchConversations();
    
    const channel = supabase
      .channel('crm-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        // Realtime Logic
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

  // 2. Fetch Messages
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

  // 3. Filtering
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (filter === 'All') return true;
      if (filter === 'Active') return c.status === 'active';
      if (filter === 'Needs Follow-up') return c.status === 'needs_follow_up';
      return true;
    });
  }, [conversations, filter]);

  const activeConversation = conversations.find(c => c.id === selectedId) || null;

  // 4. Send Message
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
        ? { ...c, last_interaction_at: newMsg.created_at, status: 'active' as const, unread_count: 0 } 
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
  
  // 5. Manual Sync
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync');
      
      if (!response.ok) {
        const result = await response.json();
        if (result.code === 'MISSING_TOKEN' || response.status === 400) {
          if (confirm('Meta Access Token is missing or invalid. Go to settings?')) {
            router.push('/settings');
          }
          return;
        }
        throw new Error(result.error || 'Sync failed');
      }
      
      await fetchConversations(); 
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