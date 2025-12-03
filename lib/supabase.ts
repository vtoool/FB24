import { createClient as createClientSSR } from '@/utils/supabase/client';
import { Conversation, Message } from '../types';

// Export the typed client
export const supabase = createClientSSR();

// --- MOCK DATA FOR PREVIEW MODE (Since we don't have real DB connection here) ---
export const mockConversations: Conversation[] = [
  {
    id: '1',
    client_name: 'Ana Popescu',
    status: 'unsold',
    last_message_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), // 20 hours ago (needs follow up)
    last_message_by: 'client',
    has_auto_replied: false,
    snippet: 'Is this still available?',
  },
  {
    id: '2',
    client_name: 'Mihai Ionescu',
    status: 'sold',
    last_message_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    last_message_by: 'me',
    has_auto_replied: false,
    snippet: 'Great, see you tomorrow!',
  },
  {
    id: '3',
    client_name: 'Elena Dumitrescu',
    status: 'unsold',
    last_message_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    last_message_by: 'client',
    has_auto_replied: false,
    snippet: 'Cat costa transportul?',
  },
];

export const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 'm1', conversation_id: '1', text: 'Buna ziua', from_role: 'client', created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: 'm2', conversation_id: '1', text: 'Mai este valabil?', from_role: 'client', created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString() },
  ],
  '2': [
    { id: 'm3', conversation_id: '2', text: 'Vreau sa cumpar.', from_role: 'client', created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'm4', conversation_id: '2', text: 'Perfect. Ne vedem maine.', from_role: 'me', created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  ],
  '3': [
    { id: 'm5', conversation_id: '3', text: 'Cat costa transportul?', from_role: 'client', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  ]
};