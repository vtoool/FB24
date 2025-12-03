
import { createClient as createClientSSR } from '@/utils/supabase/client';
import { Conversation, Message } from '../types';

// Export the typed client
export const supabase = createClientSSR();

// --- MOCK DATA FOR PREVIEW MODE ---
export const mockConversations: Conversation[] = [
  {
    id: '1',
    psid: '12345',
    customer_name: 'Ana Popescu',
    status: 'active',
    last_interaction_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), 
    unread_count: 1
  },
  {
    id: '2',
    psid: '67890',
    customer_name: 'Mihai Ionescu',
    status: 'archived',
    last_interaction_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    unread_count: 0
  },
  {
    id: '3',
    psid: '54321',
    customer_name: 'Elena Dumitrescu',
    status: 'needs_follow_up',
    last_interaction_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    unread_count: 0
  },
];

export const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 'm1', conversation_id: '1', content: 'Buna ziua', sender_type: 'user', created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: 'm2', conversation_id: '1', content: 'Mai este valabil?', sender_type: 'user', created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString() },
  ],
  '2': [
    { id: 'm3', conversation_id: '2', content: 'Vreau sa cumpar.', sender_type: 'user', created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'm4', conversation_id: '2', content: 'Perfect. Ne vedem maine.', sender_type: 'page', created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  ],
  '3': [
    { id: 'm5', conversation_id: '3', content: 'Cat costa transportul?', sender_type: 'user', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  ]
};
