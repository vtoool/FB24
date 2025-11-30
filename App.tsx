import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockConversations, mockMessages } from './lib/supabase';
import { Conversation, Message, FilterType } from './types';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<FilterType>('All');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);

  // 1. Fetch Conversations (Simulating Server Component fetch or initial Client fetch)
  useEffect(() => {
    const fetchConversations = async () => {
      // In a real app with env keys:
      // const { data } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false });
      // setConversations(data || []);
      
      // Using Mock for Preview:
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setConversations(mockConversations);
      }
    };

    fetchConversations();
    
    // Setup Realtime Subscription
    // Note: This fails gracefully if keys aren't set
    const channel = supabase
      .channel('crm-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        // Handle realtime updates (upsert)
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
  }, [selectedId]); // Re-subscribe if logic changes, though usually we keep channel open.

  // 2. Fetch Messages when Conversation Selected
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMessages(true);

    const loadMessages = async () => {
       // Real implementation:
       // const { data } = await supabase.from('messages').select('*').eq('conversation_id', selectedId).order('created_at', { ascending: true });
       // setMessages(data || []);
       
       // Mock:
       setTimeout(() => {
         setMessages(mockMessages[selectedId] || []);
         setLoadingMessages(false);
       }, 300); // Simulate network latency
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
        // Logic: 18-23 hours passed
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

    // Update Conversation snippet optimistic
    setConversations(prev => prev.map(c => {
      if (c.id === selectedId) {
        return { ...c, last_message_by: 'me', last_message_at: new Date().toISOString(), snippet: text };
      }
      return c;
    }).sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()));

    // In real app, you would call Supabase insert here
    // await supabase.from('messages').insert({ ... });
  };

  return (
    <div className="flex h-screen w-screen bg-gray-50 overflow-hidden">
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

      {/* Helper Note for User */}
      <div className="fixed bottom-4 left-4 z-50">
        <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">
           Next.js Preview Mode • Realtime: {isRealtime ? 'Active' : 'Mock'}
        </div>
      </div>
    </div>
  );
}