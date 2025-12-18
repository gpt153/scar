import { useState, useEffect } from 'react';
import { TopicBar } from './components/TopicBar';
import { ChatView } from './components/ChatView';
import { CLIView } from './components/CLIView';
import { useSocket } from './hooks/useSocket';
import { useTopics } from './hooks/useTopics';
import { useAllMessages } from './hooks/useAllMessages';
import { useAllCLIEvents } from './hooks/useAllCLIEvents';
import { getTopicColor } from './utils/topicColors';
import type { Topic } from './types';

function App() {
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [lastViewedTimes, setLastViewedTimes] = useState<Map<string, Date>>(new Map());

  // Fetch topics
  const { topics } = useTopics();

  // Preload all conversation histories
  const { loading: loadingHistory, addMessage, getMessagesForTopic, getLatestMessageTime } = useAllMessages(topics);

  // Preload all CLI event histories
  const { addEvent, getEventsForTopic } = useAllCLIEvents(topics);

  // WebSocket for real-time messages and events
  const { isConnected, messages: wsMessages, events: wsEvents, sendMessage } = useSocket(selectedTopic?.id || null);

  // Track when user views a topic
  useEffect(() => {
    if (selectedTopic) {
      setLastViewedTimes((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedTopic.id, new Date());
        return newMap;
      });
    }
  }, [selectedTopic?.id]);

  // Add WebSocket messages to the preloaded data
  useEffect(() => {
    if (selectedTopic && wsMessages.length > 0) {
      wsMessages.forEach((msg) => {
        addMessage(selectedTopic.id, msg);
      });
    }
  }, [wsMessages, selectedTopic, addMessage]);

  // Add WebSocket CLI events to the preloaded data
  useEffect(() => {
    if (selectedTopic && wsEvents.length > 0) {
      wsEvents.forEach((event) => {
        addEvent(selectedTopic.id, event);
      });
    }
  }, [wsEvents, selectedTopic, addEvent]);

  // Get messages for selected topic
  const restMessages = selectedTopic ? getMessagesForTopic(selectedTopic.id) : [];

  // Merge REST and WebSocket messages (deduplicate by id)
  const messageIds = new Set(restMessages.map((m) => m.id));
  const newWsMessages = wsMessages.filter((m) => !messageIds.has(m.id));
  const allMessages = [...restMessages, ...newWsMessages];

  // Get CLI events for selected topic
  const restEvents = selectedTopic ? getEventsForTopic(selectedTopic.id) : [];

  // Merge REST and WebSocket CLI events (deduplicate by id)
  const eventIds = new Set(restEvents.map((e) => e.id));
  const newWsEvents = wsEvents.filter((e) => !eventIds.has(e.id));
  const allEvents = [...restEvents, ...newWsEvents];

  // Get workspace color
  const workspaceColor = selectedTopic ? getTopicColor(selectedTopic.id) : null;

  // Helper to check if topic has new messages
  const hasNewMessages = (topicId: string): boolean => {
    if (topicId === selectedTopic?.id) return false; // Current topic is always "read"

    const lastViewed = lastViewedTimes.get(topicId);
    const latestMessage = getLatestMessageTime(topicId);

    if (!latestMessage) return false;
    if (!lastViewed) return true; // Never viewed = has new messages

    return latestMessage > lastViewed;
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#F5F5F7' }}>
      {/* Top Navigation Bar */}
      <TopicBar
        selectedTopicId={selectedTopic?.id || null}
        onSelectTopic={setSelectedTopic}
        isConnected={isConnected}
        hasNewMessages={hasNewMessages}
      />

      {/* Main Content - Split View with workspace color */}
      {selectedTopic ? (
        <div
          className="flex-1 flex overflow-hidden shadow-inner"
          style={{
            backgroundColor: workspaceColor?.light || 'white',
          }}
        >
          {/* Left Half - Chat Interface */}
          <div className="w-1/2 flex flex-col bg-white/90 backdrop-blur-xl border-r border-gray-200/60 shadow-sm">
            <ChatView
              messages={allMessages}
              loading={loadingHistory && topics.length === 0}
              onSendMessage={sendMessage}
              disabled={!isConnected}
              accentColor={workspaceColor?.primary}
            />
          </div>

          {/* Right Half - CLI Output */}
          <div className="w-1/2 flex flex-col bg-gray-900/95 backdrop-blur-xl">
            <CLIView events={allEvents} isConnected={isConnected} accentColor={workspaceColor?.primary} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white/50 backdrop-blur-xl">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-sm">
              <span className="text-5xl">📁</span>
            </div>
            <div className="text-lg font-medium text-gray-900 mb-2">No Workspace Selected</div>
            <div className="text-sm text-gray-500">Choose a workspace from the tabs above to begin</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
