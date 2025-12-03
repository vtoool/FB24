
import React from 'react';
import { SidebarProps, FilterType } from '../types';
import { Search, MessageCircle, RefreshCw, Archive, AlertCircle, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export const Sidebar: React.FC<SidebarProps> = ({ conversations, selectedId, onSelect, filter, setFilter, isSyncing, onSync }) => {
  const filters: FilterType[] = ['All', 'Active', 'Needs Follow-up'];

  return (
    <div className="w-full md:w-80 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-blue-600" />
            CRM Messenger
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full disabled:text-gray-300 disabled:cursor-not-allowed transition-all"
              title="Sync Messages"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            </button>
            <Link 
              href="/settings"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search conversations..." 
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex p-2 gap-1 overflow-x-auto border-b border-gray-100 scrollbar-hide">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors",
              filter === f 
                ? "bg-blue-600 text-white shadow-sm" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {isSyncing ? "Syncing from Meta..." : "No conversations found."}
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full p-4 flex items-start gap-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left group",
                selectedId === conv.id ? "bg-blue-50 border-blue-100 hover:bg-blue-50" : ""
              )}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-medium text-sm shadow-sm">
                  {(conv.customer_name || conv.psid).charAt(0)}
                </div>
                {conv.status === 'needs_follow_up' && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-400 border-2 border-white rounded-full flex items-center justify-center">
                    <AlertCircle className="w-2 h-2 text-white" />
                  </div>
                )}
                 {conv.status === 'archived' && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gray-400 border-2 border-white rounded-full flex items-center justify-center">
                    <Archive className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={cn(
                    "text-sm font-semibold truncate",
                    selectedId === conv.id ? "text-blue-900" : "text-gray-900"
                  )}>
                    {conv.customer_name || `User ${conv.psid.slice(0,4)}`}
                  </h3>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                    {new Date(conv.last_interaction_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                   <p className="text-xs text-gray-500 truncate">
                      {conv.status.replace('_', ' ')}
                   </p>
                   {conv.unread_count > 0 && (
                     <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
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