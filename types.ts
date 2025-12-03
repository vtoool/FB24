
export interface Conversation {
  id: string;
  psid: string;
  customer_name: string | null;
  status: 'active' | 'archived' | 'needs_follow_up';
  last_interaction_at: string;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  sender_type: 'user' | 'page';
  created_at: string;
  meta_message_id?: string | null;
}

export type FilterType = 'All' | 'Active' | 'Needs Follow-up';

// Props types
export interface SidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  isSyncing: boolean;
  onSync: () => void;
}

export interface ChatWindowProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  loading: boolean;
}
