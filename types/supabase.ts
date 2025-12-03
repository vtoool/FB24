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
          client_name: string
          status: 'unsold' | 'sold' | 'follow-up' | 'new'
          last_message_at: string
          last_message_by: 'client' | 'me'
          has_auto_replied: boolean
          snippet: string | null
        }
        Insert: {
          id: string
          client_name: string
          status?: 'unsold' | 'sold' | 'follow-up' | 'new'
          last_message_at?: string
          last_message_by?: 'client' | 'me'
          has_auto_replied?: boolean
          snippet?: string | null
        }
        Update: {
          id?: string
          client_name?: string
          status?: 'unsold' | 'sold' | 'follow-up' | 'new'
          last_message_at?: string
          last_message_by?: 'client' | 'me'
          has_auto_replied?: boolean
          snippet?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          text: string
          from_role: 'client' | 'me'
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          text: string
          from_role: 'client' | 'me'
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          text?: string
          from_role?: 'client' | 'me'
          created_at?: string
        }
      }
    }
  }
}