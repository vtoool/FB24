import React, { useEffect, useRef, useState } from 'react';
import { ChatWindowProps } from '../types';
import { Send, MoreVertical, Loader2, Bot, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, messages, onSendMessage, loading, onBack }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <Bot className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  const displayName = conversation.customer_name || `User ${conversation.psid}`;

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 md:px-6 md:py-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          {/* BACK BUTTON: Visible only on mobile (md:hidden) */}
          <button 
            onClick={onBack} 
            className="md:hidden text-muted-foreground hover:text-foreground p-1 -ml-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-medium text-lg ring-2 ring-background">
            {displayName.charAt(0)}
          </div>
          <div>
            <h2 className="font-bold text-foreground text-sm md:text-base">{displayName}</h2>
            {conversation.status === 'needs_follow_up' && (
               <p className="text-[10px] md:text-xs text-orange-500 font-medium">Needs Reply</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <button className="hover:text-foreground transition-colors" title="More Options">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-secondary/30">
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === 'page';
            return (
              <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] px-4 py-2 md:px-5 md:py-3 rounded-2xl text-sm shadow-sm leading-relaxed",
                  isMe 
                    ? "bg-primary text-primary-foreground rounded-br-none" 
                    : "bg-card text-card-foreground border border-border rounded-bl-none"
                )}>
                  {msg.content}
                  <div className={cn(
                    "text-[10px] mt-1 text-right opacity-70",
                    isMe ? "text-primary-foreground" : "text-muted-foreground"
                  )}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-card border-t border-border">
        <form onSubmit={handleSubmit} className="flex items-center gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-muted/50 text-foreground placeholder:text-muted-foreground border border-input rounded-full px-4 py-2 md:px-5 md:py-3 focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
          />
          <button 
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};