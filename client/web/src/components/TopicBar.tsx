import { useTopics } from '../hooks/useTopics';
import { getTopicColor } from '../utils/topicColors';
import type { Topic } from '../types';

interface TopicBarProps {
  selectedTopicId: string | null;
  onSelectTopic: (topic: Topic) => void;
  isConnected: boolean;
  hasNewMessages: (topicId: string) => boolean;
}

export function TopicBar({ selectedTopicId, onSelectTopic, isConnected, hasNewMessages }: TopicBarProps) {
  const { topics, loading } = useTopics();

  const getTopicName = (topic: Topic): string => {
    if (topic.codebase_name) {
      return topic.codebase_name;
    }
    const parts = topic.platform_conversation_id.split(':');
    return parts.length > 1 ? `Topic ${parts[1]}` : 'Unknown';
  };

  return (
    <div className="relative">
      {/* Header Bar - Apple style with frosted glass */}
      <div className="bg-white/80 backdrop-blur-2xl border-b border-gray-200/60 shadow-sm">
        <div className="flex items-center h-14 px-6 gap-6">
          {/* Logo - Apple minimalist style */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-sm">
                <span className="text-white text-base font-semibold">C</span>
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900 tracking-tight">Claude Code</div>
                <div className="flex items-center gap-1.5 -mt-0.5">
                  <div
                    className={`w-1 h-1 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <span className="text-[10px] font-medium text-gray-500 tracking-wide uppercase">
                    {isConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-200" />

          {/* Topics - Filing system tabs */}
          <div className="flex-1 flex items-end gap-1 overflow-x-auto pb-px -mb-px scrollbar-none">
            {loading ? (
              <div className="text-gray-400 text-sm py-2">Loading...</div>
            ) : (
              topics.map((topic) => {
                const color = getTopicColor(topic.id);
                const isSelected = selectedTopicId === topic.id;

                return (
                  <button
                    key={topic.id}
                    onClick={() => onSelectTopic(topic)}
                    style={{
                      backgroundColor: isSelected ? 'white' : color.light,
                      borderColor: isSelected ? color.primary : 'transparent',
                      color: isSelected ? color.primary : '#6B7280',
                    }}
                    className={`
                      relative px-4 py-2 text-sm font-medium whitespace-nowrap
                      transition-all duration-200 ease-out
                      ${
                        isSelected
                          ? 'rounded-t-lg border-t-2 border-x-2 border-b-0 -mb-px shadow-sm z-10'
                          : 'rounded-t-lg hover:bg-white/60 mb-0.5'
                      }
                    `}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {getTopicName(topic)}
                      {/* New message indicator - Apple style badge */}
                      {!isSelected && hasNewMessages(topic.id) && (
                        <span
                          style={{ backgroundColor: color.primary }}
                          className="w-2 h-2 rounded-full shadow-sm animate-pulse"
                        />
                      )}
                    </span>

                    {/* Subtle glow for selected tab */}
                    {isSelected && (
                      <div
                        style={{
                          boxShadow: `0 -2px 8px ${color.glow}`,
                        }}
                        className="absolute inset-0 rounded-t-lg pointer-events-none"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
