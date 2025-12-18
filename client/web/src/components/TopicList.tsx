import { useTopics } from '../hooks/useTopics';
import type { Topic } from '../types';

interface Props {
  selectedTopicId: string | null;
  onSelectTopic: (topic: Topic) => void;
}

export function TopicList({ selectedTopicId, onSelectTopic }: Props) {
  const { topics, loading, error } = useTopics();

  if (loading) return <div className="p-4">Loading topics...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Topics</h2>
      </div>
      <div className="divide-y divide-gray-200">
        {topics.map(topic => {
          // Extract topic name from platform_conversation_id (format: chatId:threadId)
          const topicName =
            topic.codebase_name || topic.platform_conversation_id.split(':')[1] || 'Unnamed';
          const isSelected = topic.id === selectedTopicId;

          return (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic)}
              className={`w-full text-left p-4 hover:bg-gray-100 transition-colors ${
                isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
              }`}
            >
              <div className="font-medium truncate">{topicName}</div>
              {topic.cwd && <div className="text-xs text-gray-500 truncate mt-1">{topic.cwd}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
