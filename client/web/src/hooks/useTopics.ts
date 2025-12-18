import { useState, useEffect } from 'react';
import type { Topic } from '../types';

export function useTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTopics() {
      try {
        setLoading(true);
        const response = await fetch('/api/topics');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        setTopics(data);
        setError(null);
      } catch (err) {
        console.error('[useTopics] Fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load topics');
      } finally {
        setLoading(false);
      }
    }

    fetchTopics();
  }, []);

  const refreshTopics = async () => {
    const response = await fetch('/api/topics');
    const data = await response.json();
    setTopics(data);
  };

  return { topics, loading, error, refreshTopics };
}
