import { useEffect, useRef } from 'react';
import type { CLIEvent } from '../types';

interface CLIViewProps {
  events: CLIEvent[];
  isConnected: boolean;
  accentColor?: string;
}

export function CLIView({ events, isConnected, accentColor }: CLIViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events]);

  const getEventColor = (type: CLIEvent['type']): string => {
    switch (type) {
      case 'tool_call':
        return 'text-cyan-400';
      case 'tool_result':
        return 'text-green-400';
      case 'thinking':
        return 'text-purple-400';
      case 'error':
        return 'text-red-400';
      case 'status':
        return 'text-yellow-400';
      case 'message':
        return 'text-gray-300';
      default:
        return 'text-gray-400';
    }
  };

  const getEventIcon = (type: CLIEvent['type']): string => {
    switch (type) {
      case 'tool_call':
        return '⚡';
      case 'tool_result':
        return '✓';
      case 'thinking':
        return '🤔';
      case 'error':
        return '✗';
      case 'status':
        return '→';
      case 'message':
        return '💬';
      default:
        return '•';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* CLI Header */}
      <div
        className="bg-gray-800 border-b px-4 py-3 flex items-center justify-between"
        style={{
          borderBottomColor: accentColor || '#374151',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="font-mono text-sm font-medium"
            style={{
              color: accentColor || '#34D399',
            }}
          >
            claude@scar
          </div>
          <div className="text-gray-500">~</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-medium">Live Output</span>
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: isConnected ? accentColor || '#34D399' : '#F87171',
            }}
          />
        </div>
      </div>

      {/* Terminal Output */}
      <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {events.length === 0 ? (
          <div className="text-gray-500 flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2">⌨️</div>
              <div>Waiting for activity...</div>
            </div>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="mb-3">
              {/* Event Header */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-600 text-xs">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={getEventColor(event.type)}>{getEventIcon(event.type)}</span>
                <span className={`${getEventColor(event.type)} font-semibold uppercase text-xs`}>
                  {event.type.replace('_', ' ')}
                </span>
                {event.metadata?.toolName && (
                  <span className="text-cyan-300 text-xs">({event.metadata.toolName})</span>
                )}
              </div>

              {/* Event Content */}
              <div className="pl-6 text-gray-300 whitespace-pre-wrap break-words">
                {event.content}
              </div>

              {/* Event Metadata */}
              {event.metadata && (
                <div className="pl-6 mt-1 text-xs text-gray-500">
                  {event.metadata.duration && <span>Duration: {event.metadata.duration}ms</span>}
                  {event.metadata.exitCode !== undefined && (
                    <span className={event.metadata.exitCode === 0 ? 'text-green-600' : 'text-red-600'}>
                      {' '}
                      Exit: {event.metadata.exitCode}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
