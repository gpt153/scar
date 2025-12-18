import { useState, useEffect, useCallback } from 'react';
import type { Message, Topic } from '../types';

export function useAllMessages(topics: Topic[]) {
  const [messagesByTopic, setMessagesByTopic] = useState<Map<string, Message[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topics.length === 0) {
      return;
    }

    async function fetchAllMessages() {
      try {
        setLoading(true);

        // Fetch messages for all topics in parallel
        const fetchPromises = topics.map(async (topic) => {
          try {
            const response = await fetch(`/api/messages/${topic.id}`);
            if (!response.ok) {
              console.error(`[useAllMessages] Failed to fetch messages for ${topic.id}`);
              return { topicId: topic.id, messages: [] };
            }
            const messages = await response.json();
            return { topicId: topic.id, messages };
          } catch (err) {
            console.error(`[useAllMessages] Error fetching messages for ${topic.id}:`, err);
            return { topicId: topic.id, messages: [] };
          }
        });

        const results = await Promise.all(fetchPromises);

        // Build map of messages by topic
        const newMap = new Map<string, Message[]>();
        results.forEach(({ topicId, messages }) => {
          newMap.set(topicId, messages);
        });

        setMessagesByTopic(newMap);
      } catch (err) {
        console.error('[useAllMessages] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAllMessages();
  }, [topics]);

  // Helper to add a new message to a specific topic (memoized to prevent infinite loops)
  const addMessage = useCallback((topicId: string, message: Message) => {
    setMessagesByTopic((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(topicId) || [];
      newMap.set(topicId, [...existing, message]);
      return newMap;
    });
  }, []);

  // Helper to get messages for a specific topic
  const getMessagesForTopic = (topicId: string): Message[] => {
    return messagesByTopic.get(topicId) || [];
  };

  // Helper to get latest message timestamp for a topic
  const getLatestMessageTime = (topicId: string): Date | null => {
    const messages = messagesByTopic.get(topicId) || [];
    if (messages.length === 0) return null;

    const latestMessage = messages[messages.length - 1];
    return new Date(latestMessage.created_at);
  };

  return {
    messagesByTopic,
    loading,
    addMessage,
    getMessagesForTopic,
    getLatestMessageTime,
  };
}
