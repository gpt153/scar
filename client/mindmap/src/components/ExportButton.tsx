import React, { useState } from 'react';
import { useMindMapStore } from '@/store/mindmap.store';
import { ExportService } from '@/services/export.service';

export const ExportButton: React.FC = () => {
  const { exportMindMap, data, selectedNodeId } = useMindMapStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = (format: 'json' | 'markdown' | 'plan-feature'): void => {
    const mindMapData = exportMindMap();
    const timestamp = new Date().toISOString().split('T')[0];
    const projectName = data.project.name.toLowerCase().replace(/\s+/g, '-');

    switch (format) {
      case 'json': {
        const content = ExportService.exportJSON(mindMapData);
        ExportService.downloadFile(
          content,
          `${projectName}-${timestamp}.json`,
          'application/json'
        );
        break;
      }
      case 'markdown': {
        const content = ExportService.exportMarkdown(mindMapData);
        ExportService.downloadFile(content, `${projectName}-${timestamp}.md`, 'text/markdown');
        break;
      }
      case 'plan-feature': {
        const content = ExportService.exportPlanFeature(mindMapData, selectedNodeId || undefined);
        ExportService.downloadFile(
          content,
          `${projectName}-plan-${timestamp}.md`,
          'text/markdown'
        );
        break;
      }
    }

    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
      >
        Export
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <button
            onClick={() => handleExport('json')}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
          >
            Export as JSON
          </button>
          <button
            onClick={() => handleExport('markdown')}
            className="w-full text-left px-4 py-2 hover:bg-gray-100"
          >
            Export as Markdown
          </button>
          <button
            onClick={() => handleExport('plan-feature')}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg"
          >
            Export for /plan-feature
          </button>
        </div>
      )}
    </div>
  );
};
