"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockConversations, mockMessages } from '../lib/supabase';
import { Conversation, Message, FilterType } from '../types';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';

export default function Home() {
  // --- FIX START: Prevent Hydration Errors ---
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  // -------------------------------------------

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<FilterType>('All');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);

  // 1. Fetch Conversations
  useEffect(() => {
    const fetchConversations = async () => {
      // Using Mock for Preview if env var is missing
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setConversations(mockConversations);
      } else {
        // Ideally fetch real data here if Supabase is connected
        // const { data } = await supabase.from('conversations').select('*');
        // if (data) setConversations(data);
      }
    };

    fetchConversations();
    
    // Setup Realtime Subscription
    const channel = supabase
      .channel('crm-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        setConversations(prev => {
           const newRecord = payload.new as Conversation;
           const exists = prev.find(c => c.id === newRecord.id);
           if (exists) return prev.map(c => c.id === newRecord.id ? newRecord : c).sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
           return [newRecord, ...prev];
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
  }, [selectedId]);

  // 2. Fetch Messages when Conversation Selected
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMessages(true);

    const loadMessages = async () => {
       // Mock:
       setTimeout(() => {
         setMessages(mockMessages[selectedId] || []);
         setLoadingMessages(false);
       }, 300); 
    };
    
    loadMessages();
  }, [selectedId]);

  // 3. Filtering Logic
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (filter === 'All') return true;
      if (filter === 'Unsold') return c.status === 'unsold';
      if (filter === 'Follow-up Needed') {
        if (c.status !== 'unsold' || c.last_message_by === 'me') return false;
        // This Date calculation is what causes the error!
        const diffHours = (new Date().getTime() - new Date(c.last_message_at).getTime()) / (1000 * 60 * 60);
        return diffHours >= 18 && diffHours <= 23;
      }
      return true;
    });
  }, [conversations, filter]);

  const activeConversation = conversations.find(c => c.id === selectedId) || null;

  // 4. Send Message Handler
  const handleSendMessage = async (text: string) => {
    if (!selectedId) return;
    
    // Optimistic Update
    const newMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: selectedId,
      text,
      from_role: 'me',
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMsg]);

    setConversations(prev => prev.map(c => {
      if (c.id === selectedId) {
        const updatedConversation: Conversation = { 
          ...c, 
          last_message_by: 'me', 
          last_message_at: new Date().toISOString(), 
          snippet: text 
        };
        return updatedConversation;
      }
      return c;
    }).sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));
  };

  // --- FIX END: If not mounted, render nothing to avoid mismatch ---
  if (!isMounted) return null;

  return (
    <main className="flex h-screen w-screen bg-gray-50 overflow-hidden">
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
        <Sidebar 
          conversations={filteredConversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filter={filter}
          setFilter={setFilter}
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

      <div className="fixed bottom-4 left-4 z-50">
        <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">
           Next.js Preview Mode • Realtime: {isRealtime ? 'Active' : 'Mock'}
        </div>
      </div>
    </main>
  );
}