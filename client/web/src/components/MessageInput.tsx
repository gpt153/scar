import { useState } from 'react';
import { ScreenshotCapture } from './ScreenshotCapture';

interface Props {
  onSendMessage: (content: string, screenshot?: string) => void;
  disabled?: boolean;
  accentColor?: string;
}

export function MessageInput({ onSendMessage, disabled, accentColor }: Props) {
  const [content, setContent] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !screenshot) return;

    onSendMessage(content.trim(), screenshot || undefined);
    setContent('');
    setScreenshot(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
      {screenshot && (
        <div className="mb-2 relative inline-block">
          <img src={screenshot} alt="Screenshot preview" className="max-w-xs max-h-32 rounded" />
          <button
            type="button"
            onClick={() => setScreenshot(null)}
            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          disabled={disabled}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 transition-all"
          style={{
            ['--tw-ring-color' as string]: accentColor || '#3B82F6',
          }}
          rows={3}
        />
        <div className="flex flex-col gap-2">
          <ScreenshotCapture onCapture={setScreenshot} />
          <button
            type="submit"
            disabled={disabled || (!content.trim() && !screenshot)}
            className="px-4 py-2 text-white rounded-lg font-medium shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{
              backgroundColor: accentColor || '#3B82F6',
              filter: disabled || (!content.trim() && !screenshot) ? 'brightness(0.8)' : 'brightness(1)',
            }}
            onMouseEnter={(e) => {
              if (!disabled && (content.trim() || screenshot)) {
                e.currentTarget.style.filter = 'brightness(0.9)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && (content.trim() || screenshot)) {
                e.currentTarget.style.filter = 'brightness(1)';
              }
            }}
          >
            Send
          </button>
        </div>
      </div>
    </form>
  );
}
