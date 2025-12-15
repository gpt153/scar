import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useMindMapStore } from '@/store/mindmap.store';
import { CustomNode } from './CustomNode';

export const MindMap: React.FC = () => {
  const { data, selectedNodeId, setSelectedNode, updateNode } = useMindMapStore();

  // Define custom node types
  const nodeTypes: NodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  // Convert MindMapNode to ReactFlow Node
  const convertToReactFlowNodes = (storeNodes: typeof data.nodes): Node[] => {
    return storeNodes.map(node => ({
      id: node.id,
      type: 'custom',
      data: { label: node.label, description: node.description },
      position: node.position,
      selected: node.id === selectedNodeId,
    }));
  };

  const convertToReactFlowEdges = (storeEdges: typeof data.edges): Edge[] => {
    return storeEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
    }));
  };

  const [nodes, setNodes, onNodesChange] = useNodesState(convertToReactFlowNodes(data.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(convertToReactFlowEdges(data.edges));

  // Sync store changes to React Flow state
  useEffect(() => {
    setNodes(convertToReactFlowNodes(data.nodes));
  }, [data.nodes, selectedNodeId, setNodes]);

  useEffect(() => {
    setEdges(convertToReactFlowEdges(data.edges));
  }, [data.edges, setEdges]);

  // Handle node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // Handle node position changes
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode]
  );

  // Handle new edge creation
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge(connection, eds));
    },
    [setEdges]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};
