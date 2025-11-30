
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, mockConversations, mockMessages } from '../lib/supabase';
import { Conversation, Message, FilterType } from '../types';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<FilterType>('All');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setConversations(mockConversations);
      return;
    }
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching conversations:", error);
    } else if (data) {
      setConversations(data);
    }
  }, []);

  // 1. Fetch Conversations & Setup Realtime
  useEffect(() => {
    fetchConversations();
    
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const channel = supabase
      .channel('crm-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const newRecord = payload.new as Conversation;
        setConversations(prev => {
           const exists = prev.find(c => c.id === newRecord.id);
           if (payload.eventType === 'DELETE') {
             return prev.filter(c => c.id !== payload.old.id);
           }
           if (exists) {
             return prev.map(c => c.id === newRecord.id ? newRecord : c).sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
           }
           return [newRecord, ...prev].sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
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
  }, [selectedId, fetchConversations]);

  // 2. Fetch Messages when Conversation Selected
  useEffect(() => {
    if (!selectedId) return;

    const loadMessages = async () => {
      setLoadingMessages(true);
       if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
         setMessages(mockMessages[selectedId] || []);
       } else {
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
       }
       setLoadingMessages(false);
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
    
    const newMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: selectedId,
      text,
      from_role: 'me',
      created_at: new Date().toISOString()
    };
    
    // Optimistic UI updates
    setMessages(prev => [...prev, newMsg]);
    setConversations(prev => prev.map(c => 
      c.id === selectedId 
        // FIX: Use 'as const' to prevent TypeScript from widening the literal type 'me' to 'string',
        // which was causing a type mismatch with Conversation['last_message_by'].
        ? { ...c, last_message_by: 'me' as const, last_message_at: newMsg.created_at, snippet: text } 
        : c
    ).sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));

    // Database updates
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      await Promise.all([
        supabase.from('messages').insert({
          conversation_id: selectedId,
          text: text,
          from_role: 'me',
          created_at: newMsg.created_at
        }),
        supabase.from('conversations').update({
          last_message_at: newMsg.created_at,
          last_message_by: 'me',
          snippet: text,
          status: 'unsold', // Sending a message implies it's an active lead
          has_auto_replied: false // Reset auto-reply status
        }).eq('id', selectedId)
      ]);
    }
  };
  
  // 5. Manual Sync Handler
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync');
      if (!response.ok) throw new Error('Sync failed');
      const result = await response.json();
      await fetchConversations(); // Refresh list after sync
      alert(result.message || 'Sync complete!');
    } catch (error) {
      console.error(error);
      alert('An error occurred during sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex h-screen w-screen bg-gray-50 overflow-hidden">
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full flex-col`}>
        <div className="bg-white border-r border-b border-gray-200 p-3">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="p-2 w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Sync conversations"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing..." : "Sync Messages"}
            </button>
        </div>
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
