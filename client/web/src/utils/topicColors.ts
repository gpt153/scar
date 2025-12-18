/**
 * Apple-inspired color palette for topics
 * Soft, sophisticated colors with good contrast
 */
export const TOPIC_COLORS = [
  { id: 'blue', primary: '#007AFF', light: '#E5F2FF', glow: 'rgba(0, 122, 255, 0.3)' },
  { id: 'purple', primary: '#AF52DE', light: '#F3E5FF', glow: 'rgba(175, 82, 222, 0.3)' },
  { id: 'pink', primary: '#FF2D55', light: '#FFE5EC', glow: 'rgba(255, 45, 85, 0.3)' },
  { id: 'orange', primary: '#FF9500', light: '#FFF4E5', glow: 'rgba(255, 149, 0, 0.3)' },
  { id: 'green', primary: '#34C759', light: '#E5F9ED', glow: 'rgba(52, 199, 89, 0.3)' },
  { id: 'teal', primary: '#5AC8FA', light: '#E5F7FF', glow: 'rgba(90, 200, 250, 0.3)' },
  { id: 'indigo', primary: '#5856D6', light: '#EEEEFF', glow: 'rgba(88, 86, 214, 0.3)' },
  { id: 'red', primary: '#FF3B30', light: '#FFE8E6', glow: 'rgba(255, 59, 48, 0.3)' },
];

/**
 * Get color for a topic based on its ID (deterministic)
 */
export function getTopicColor(topicId: string) {
  const hash = topicId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  const index = Math.abs(hash) % TOPIC_COLORS.length;
  return TOPIC_COLORS[index];
}
