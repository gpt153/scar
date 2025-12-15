import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface CustomNodeData {
  label: string;
  description: string;
}

export const CustomNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] max-w-[300px] ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="font-semibold text-gray-900 mb-1">{data.label}</div>

      {data.description && (
        <div className="text-xs text-gray-600 leading-tight">{data.description}</div>
      )}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
