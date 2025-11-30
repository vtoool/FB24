import React from 'react';
import { SidebarProps, FilterType } from '../types';
import { Search, User, Clock, CheckCircle, MessageCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export const Sidebar: React.FC<SidebarProps> = ({ conversations, selectedId, onSelect, filter, setFilter }) => {
  const filters: FilterType[] = ['All', 'Unsold', 'Follow-up Needed'];

  return (
    <div className="w-full md:w-80 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-blue-600" />
          CRM Messenger
        </h1>
        <div className="mt-4 relative">
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
            No conversations found.
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
                  {conv.client_name.charAt(0)}
                </div>
                {conv.status === 'unsold' && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-400 border-2 border-white rounded-full flex items-center justify-center">
                    <Clock className="w-2 h-2 text-white" />
                  </div>
                )}
                 {conv.status === 'sold' && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                    <CheckCircle className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={cn(
                    "text-sm font-semibold truncate",
                    selectedId === conv.id ? "text-blue-900" : "text-gray-900"
                  )}>
                    {conv.client_name}
                  </h3>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                    {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className={cn(
                  "text-xs truncate",
                  conv.last_message_by === 'client' && !conv.has_auto_replied ? "font-semibold text-gray-800" : "text-gray-500"
                )}>
                  {conv.last_message_by === 'me' && <span className="mr-1">You:</span>}
                  {conv.snippet}
                </p>
                {/* AI Follow Up Badge logic visualizer */}
                {conv.last_message_by === 'client' && 
                 conv.status === 'unsold' && 
                 !conv.has_auto_replied && (
                  <div className="mt-2 flex items-center gap-1">
                     <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">
                      Auto-reply Pending
                     </span>
                  </div>
                 )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};