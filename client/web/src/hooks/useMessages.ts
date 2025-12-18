import { useState, useEffect } from 'react';
import type { Message } from '../types';

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    async function fetchMessages() {
      try {
        setLoading(true);
        const response = await fetch(`/api/messages/${conversationId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setMessages(data);
      } catch (err) {
        console.error('[useMessages] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [conversationId]);

  return { messages, loading, setMessages };
}
