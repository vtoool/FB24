export interface Conversation {
  id: string;
  client_name: string;
  status: 'unsold' | 'sold' | 'follow-up' | 'new';
  last_message_at: string;
  last_message_by: 'client' | 'me';
  has_auto_replied: boolean;
  snippet: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  text: string;
  from_role: 'client' | 'me';
  created_at: string;
}

export type FilterType = 'All' | 'Unsold' | 'Follow-up Needed';

// Props types
export interface SidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
}

export interface ChatWindowProps {
  conversation: Conversation | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  loading: boolean;
}