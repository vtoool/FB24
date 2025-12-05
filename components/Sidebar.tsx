import React, { useState, useMemo } from 'react';
import { SidebarProps, FilterType } from '../types';
import { Search, MessageCircle, RefreshCw, Settings, AlertCircle, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export const Sidebar: React.FC<SidebarProps> = ({ conversations, selectedId, onSelect, filter, setFilter, isSyncing, onSync }) => {
  const filters: FilterType[] = ['All', 'Needs Reply', 'Needs Follow-up'];
  const [searchQuery, setSearchQuery] = useState("");

  const processedConversations = useMemo(() => {
    let result = conversations;

    // --- LOGIC FIX: Dynamic "Needs Follow-up" Calculation ---
    if (filter === 'Needs Follow-up') {
      result = result.filter(c => {
        // 1. Was the last message sent by the Agent (Page)?
        const isPageLast = c.last_message_by === 'page';
        
        // 2. Has it been more than 17 hours?
        const lastTime = new Date(c.last_interaction_at).getTime();
        const now = new Date().getTime();
        const hoursDiff = (now - lastTime) / (1000 * 60 * 60);

        return isPageLast && hoursDiff > 17;
      });
    }

    // --- NEW LOGIC: Needs Reply ---
    if (filter === 'Needs Reply') {
      result = result.filter(c => c.last_message_by === 'user');
    }

    // Search Filter
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c => 
        (c.customer_name || '').toLowerCase().includes(lowerQuery) ||
        (c.last_message_preview || '').toLowerCase().includes(lowerQuery)
      );

      // Sort: Name Match > Content Match
      result.sort((a, b) => {
        const aNameMatch = (a.customer_name || '').toLowerCase().includes(lowerQuery);
        const bNameMatch = (b.customer_name || '').toLowerCase().includes(lowerQuery);
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        return new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime();
      });
    } else {
      // Default Sort
      result.sort((a, b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime());
    }

    return result;
  }, [conversations, filter, searchQuery]);

  return (
    // Added 'flex-none' to prevent shrinking logic issues
    <div className="w-full h-full bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            CRM
          </h1>
          <div className="flex items-center gap-1">
             <ThemeToggle />
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="p-2 text-muted-foreground hover:text-primary hover:bg-accent rounded-full disabled:opacity-50 transition-all"
              title="Sync Messages"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            </button>
            <Link href="/settings" className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-all">
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..." 
            className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
          />
        </div>
      </div>

      <div className="flex p-2 gap-1 overflow-x-auto border-b border-border scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors",
              filter === f 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-card">
        {processedConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {isSyncing ? "Syncing..." : "No conversations found."}
          </div>
        ) : (
          processedConversations.map((conv) => {
            // Dynamic check for badge display (same logic as filter)
            const isFollowUp = conv.last_message_by === 'page' && 
                ((new Date().getTime() - new Date(conv.last_interaction_at).getTime()) / 36e5) > 17;
            
            const isNeedsReply = conv.last_message_by === 'user';

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 border-b border-border hover:bg-accent/50 transition-colors text-left group",
                  selectedId === conv.id ? "bg-accent/80 border-border" : ""
                )}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-medium text-sm shadow-sm ring-2 ring-background">
                    {(conv.customer_name || conv.psid).charAt(0)}
                  </div>
                  {isFollowUp && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 border-2 border-background rounded-full flex items-center justify-center">
                      <AlertCircle className="w-2 h-2 text-white" />
                    </div>
                  )}
                  {isNeedsReply && (
                     <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-background rounded-full flex items-center justify-center">
                       <MessageSquare className="w-2 h-2 text-white" />
                     </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-sm font-semibold truncate text-foreground">
                      {conv.customer_name || `User ${conv.psid.slice(0,4)}`}
                    </h3>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {getRelativeTime(conv.last_interaction_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                     <p className={cn(
                       "text-xs truncate max-w-[85%]", 
                       conv.unread_count > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                     )}>
                        {conv.last_message_by === 'page' && <span className="opacity-50 mr-1">You:</span>}
                        {conv.last_message_preview || "No messages"}
                     </p>
                     
                     {conv.unread_count > 0 && (
                       <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                         {conv.unread_count}
                       </span>
                     )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};