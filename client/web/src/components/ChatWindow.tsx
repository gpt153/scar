import { useEffect, useRef } from 'react';
import type { Message } from '../types';

interface Props {
  messages: Message[];
  loading?: boolean;
}

export function ChatWindow({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Loading messages...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No messages yet. Start a conversation!
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map(message => (
        <div
          key={message.id}
          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-2xl rounded-lg px-4 py-2 ${
              message.sender === 'user'
                ? 'bg-blue-500 text-white'
                : message.sender === 'assistant'
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-yellow-100 text-gray-900'
            }`}
          >
            <div className="text-xs opacity-75 mb-1">
              {message.sender === 'user' ? 'You' : 'Assistant'}
              {' • '}
              {new Date(message.created_at).toLocaleTimeString()}
            </div>
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            {message.images && message.images.length > 0 && (
              <div className="text-xs opacity-75 mt-2">📷 {message.images.length} image(s)</div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
