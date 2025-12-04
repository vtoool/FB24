import React, { useState, useMemo } from 'react';
import { SidebarProps, FilterType } from '../types';
import { Search, MessageCircle, RefreshCw, Settings, AlertCircle, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

// Helper for "7h ago" style time
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
  // 1. Remove "Active" from filters
  const filters: FilterType[] = ['All', 'Needs Follow-up'];
  const [searchQuery, setSearchQuery] = useState("");

  // 2. Smart Search & Sort Logic
  const processedConversations = useMemo(() => {
    let result = conversations;

    // Filter by Tab
    if (filter === 'Needs Follow-up') {
      result = result.filter(c => c.status === 'needs_follow_up');
    }

    // Search Filter
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c => 
        (c.customer_name || '').toLowerCase().includes(lowerQuery) ||
        (c.last_message_preview || '').toLowerCase().includes(lowerQuery)
      );

      // Custom Sort: Name Match > Content Match > Date
      result.sort((a, b) => {
        const aNameMatch = (a.customer_name || '').toLowerCase().includes(lowerQuery);
        const bNameMatch = (b.customer_name || '').toLowerCase().includes(lowerQuery);

        if (aNameMatch && !bNameMatch) return -1; // a comes first
        if (!aNameMatch && bNameMatch) return 1;  // b comes first
        
        // If both match same criteria, sort by date (newest first)
        return new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime();
      });
    } else {
      // Default Sort: Newest First
      result.sort((a, b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime());
    }

    return result;
  }, [conversations, filter, searchQuery]);

  return (
    <div className="w-full md:w-80 h-full bg-card border-r border-border flex flex-col">
      {/* Header */}
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
              className="p-2 text-muted-foreground hover:text-primary hover:bg-accent rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="Sync Messages"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            </button>
            <Link 
              href="/settings"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-all"
              title="Settings"
            >
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
            placeholder="Search name or message..." 
            className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Filters */}
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

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-card">
        {processedConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {isSyncing ? "Syncing..." : searchQuery ? "No matches found." : "No conversations found."}
          </div>
        ) : (
          processedConversations.map((conv) => (
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
                {conv.status === 'needs_follow_up' && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 border-2 border-background rounded-full flex items-center justify-center" title="Needs Follow Up">
                    <AlertCircle className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={cn(
                    "text-sm font-semibold truncate transition-colors",
                    selectedId === conv.id ? "text-foreground" : "text-foreground"
                  )}>
                    {conv.customer_name || `User ${conv.psid.slice(0,4)}`}
                  </h3>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {getRelativeTime(conv.last_interaction_at)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                   {/* Message Preview instead of Status Text */}
                   <p className={cn(
                     "text-xs truncate max-w-[85%]", 
                     conv.unread_count > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                   )}>
                      {conv.last_message_preview || "No messages yet"}
                   </p>
                   
                   {conv.unread_count > 0 && (
                     <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                       {conv.unread_count}
                     </span>
                   )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};