
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string
          psid: string
          customer_name: string | null
          status: 'active' | 'archived' | 'needs_follow_up'
          last_interaction_at: string
          unread_count: number
          last_message_by: 'user' | 'page' | null
          last_message_preview: string | null
        }
        Insert: {
          id?: string
          psid: string
          customer_name?: string | null
          status?: 'active' | 'archived' | 'needs_follow_up'
          last_interaction_at?: string
          unread_count?: number
          last_message_by?: 'user' | 'page' | null
          last_message_preview?: string | null
        }
        Update: {
          id?: string
          psid?: string
          customer_name?: string | null
          status?: 'active' | 'archived' | 'needs_follow_up'
          last_interaction_at?: string
          unread_count?: number
          last_message_by?: 'user' | 'page' | null
          last_message_preview?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          content: string
          sender_type: 'user' | 'page'
          meta_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          content: string
          sender_type: 'user' | 'page'
          meta_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          content?: string
          sender_type?: 'user' | 'page'
          meta_message_id?: string | null
          created_at?: string
        }
      }
      settings: {
        Row: {
          user_id: string
          meta_page_access_token: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          meta_page_access_token?: string | null
          created_at?: string
        }
        Update: {
          user_id?: string
          meta_page_access_token?: string | null
          created_at?: string
        }
      }
    }
  }
}