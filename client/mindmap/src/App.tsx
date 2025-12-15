import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { MindMap } from '@/components/MindMap';
import { ChatPanel } from '@/components/ChatPanel';
import { ExportButton } from '@/components/ExportButton';
import { useMindMapStore } from '@/store/mindmap.store';

export const App: React.FC = () => {
  const { data } = useMindMapStore();

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Mind Map</h1>
            <p className="text-sm text-gray-600">{data.project.name}</p>
          </div>
          <ExportButton />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mind Map Canvas (70%) */}
        <div className="flex-1">
          <ReactFlowProvider>
            <MindMap />
          </ReactFlowProvider>
        </div>

        {/* Chat Panel (30%) */}
        <div className="w-96">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
};
