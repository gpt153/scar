import { useEffect, useRef } from 'react';
import { MessageInput } from './MessageInput';
import type { Message } from '../types';

interface ChatViewProps {
  messages: Message[];
  loading: boolean;
  onSendMessage: (content: string, screenshot?: string) => void;
  disabled: boolean;
  accentColor?: string;
}

export function ChatView({ messages, loading, onSendMessage, disabled, accentColor }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-12 h-12 border-4 rounded-full animate-spin"
                style={{
                  borderColor: accentColor ? `${accentColor}20` : '#DBEAFE',
                  borderTopColor: accentColor || '#2563EB',
                }}
              />
              <div className="text-gray-500 font-medium">Loading conversation...</div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <span className="text-4xl">💬</span>
              </div>
              <div className="text-gray-600 font-medium mb-2">No messages yet</div>
              <div className="text-gray-400 text-sm">Start your conversation with Claude!</div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 animate-fadeIn ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-md">
                  <span className="text-white text-sm font-bold">C</span>
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-md transition-all duration-300 hover:shadow-lg ${
                  msg.sender === 'user'
                    ? 'text-white'
                    : msg.sender === 'system'
                      ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 text-yellow-900 border border-yellow-300/50'
                      : 'bg-white border border-gray-200 text-gray-900'
                }`}
                style={
                  msg.sender === 'user'
                    ? {
                        background: accentColor
                          ? `linear-gradient(to right, ${accentColor}, ${accentColor}dd)`
                          : 'linear-gradient(to right, #2563EB, #3B82F6)',
                      }
                    : undefined
                }
              >
                <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                <div
                  className={`text-xs mt-2 font-medium ${
                    msg.sender === 'user' ? 'text-white/80' : 'text-gray-400'
                  }`}
                >
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              {msg.sender === 'user' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
                  style={{
                    background: accentColor
                      ? `linear-gradient(to bottom right, ${accentColor}, ${accentColor}dd)`
                      : 'linear-gradient(to bottom right, #2563EB, #3B82F6)',
                  }}
                >
                  <span className="text-white text-sm font-bold">U</span>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 p-5 bg-white shadow-inner">
        <MessageInput onSendMessage={onSendMessage} disabled={disabled} accentColor={accentColor} />
      </div>
    </>
  );
}
