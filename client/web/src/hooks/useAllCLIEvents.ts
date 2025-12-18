import { useState, useEffect, useCallback } from 'react';
import type { CLIEvent, Topic } from '../types';

export function useAllCLIEvents(topics: Topic[]) {
  const [eventsByTopic, setEventsByTopic] = useState<Map<string, CLIEvent[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topics.length === 0) {
      return;
    }

    async function fetchAllCLIEvents() {
      try {
        setLoading(true);

        // Fetch CLI events for all topics in parallel
        const fetchPromises = topics.map(async (topic) => {
          try {
            const response = await fetch(`/api/cli-events/${topic.id}`);
            if (!response.ok) {
              console.error(`[useAllCLIEvents] Failed to fetch events for ${topic.id}`);
              return { topicId: topic.id, events: [] };
            }
            const events = await response.json();
            return { topicId: topic.id, events };
          } catch (err) {
            console.error(`[useAllCLIEvents] Error fetching events for ${topic.id}:`, err);
            return { topicId: topic.id, events: [] };
          }
        });

        const results = await Promise.all(fetchPromises);

        // Build map of events by topic
        const newMap = new Map<string, CLIEvent[]>();
        results.forEach(({ topicId, events }) => {
          newMap.set(topicId, events);
        });

        setEventsByTopic(newMap);
      } catch (err) {
        console.error('[useAllCLIEvents] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAllCLIEvents();
  }, [topics]);

  // Helper to add a new event to a specific topic (memoized to prevent infinite loops)
  const addEvent = useCallback((topicId: string, event: CLIEvent) => {
    setEventsByTopic((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(topicId) || [];
      newMap.set(topicId, [...existing, event]);
      return newMap;
    });
  }, []);

  // Helper to get events for a specific topic
  const getEventsForTopic = (topicId: string): CLIEvent[] => {
    return eventsByTopic.get(topicId) || [];
  };

  return {
    eventsByTopic,
    loading,
    addEvent,
    getEventsForTopic,
  };
}
