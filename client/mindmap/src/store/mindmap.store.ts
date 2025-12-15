import { create } from 'zustand';
import type {
  MindMapData,
  MindMapNode,
  MindMapEdge,
  ChatMessage,
} from '@/types/mindmap.types';
import { applyTreeLayout } from '@/utils/layout';

interface MindMapStore {
  // State
  data: MindMapData;
  selectedNodeId: string | null;
  chatHistory: ChatMessage[];
  isAIThinking: boolean;

  // Actions - Nodes
  addNode: (node: MindMapNode) => void;
  updateNode: (id: string, updates: Partial<MindMapNode>) => void;
  deleteNode: (id: string) => void;
  setSelectedNode: (id: string | null) => void;

  // Actions - Edges
  addEdge: (edge: MindMapEdge) => void;
  deleteEdge: (id: string) => void;

  // Actions - Chat
  addChatMessage: (message: ChatMessage) => void;
  clearChatHistory: () => void;
  setAIThinking: (thinking: boolean) => void;

  // Actions - Project
  updateProject: (updates: Partial<MindMapData['project']>) => void;
  loadMindMap: (data: MindMapData) => void;
  exportMindMap: () => MindMapData;

  // Selectors
  getNodeById: (id: string) => MindMapNode | undefined;
  getChildNodes: (parentId: string) => MindMapNode[];
  getParentNode: (childId: string) => MindMapNode | undefined;

  // Layout
  applyLayout: () => void;
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  // Initial state
  data: {
    version: '1.0',
    project: {
      name: 'Untitled Project',
      description: '',
      created_at: new Date().toISOString(),
    },
    nodes: [],
    edges: [],
  },
  selectedNodeId: null,
  chatHistory: [],
  isAIThinking: false,

  // Node actions
  addNode: node =>
    set(state => ({
      data: {
        ...state.data,
        nodes: [...state.data.nodes, node],
      },
    })),

  updateNode: (id, updates) =>
    set(state => ({
      data: {
        ...state.data,
        nodes: state.data.nodes.map(n => (n.id === id ? { ...n, ...updates } : n)),
      },
    })),

  deleteNode: id =>
    set(state => ({
      data: {
        ...state.data,
        nodes: state.data.nodes.filter(n => n.id !== id),
        edges: state.data.edges.filter(e => e.source !== id && e.target !== id),
      },
    })),

  setSelectedNode: id => set({ selectedNodeId: id }),

  // Edge actions
  addEdge: edge =>
    set(state => ({
      data: {
        ...state.data,
        edges: [...state.data.edges, edge],
      },
    })),

  deleteEdge: id =>
    set(state => ({
      data: {
        ...state.data,
        edges: state.data.edges.filter(e => e.id !== id),
      },
    })),

  // Chat actions
  addChatMessage: message =>
    set(state => ({
      chatHistory: [...state.chatHistory, message],
    })),

  clearChatHistory: () => set({ chatHistory: [] }),

  setAIThinking: thinking => set({ isAIThinking: thinking }),

  // Project actions
  updateProject: updates =>
    set(state => ({
      data: {
        ...state.data,
        project: {
          ...state.data.project,
          ...updates,
          updated_at: new Date().toISOString(),
        },
      },
    })),

  loadMindMap: data => set({ data }),

  exportMindMap: () => get().data,

  // Selectors
  getNodeById: id => get().data.nodes.find(n => n.id === id),

  getChildNodes: parentId => get().data.nodes.filter(n => n.parent_id === parentId),

  getParentNode: childId => {
    const child = get().data.nodes.find(n => n.id === childId);
    if (!child || !child.parent_id) return undefined;
    return get().data.nodes.find(n => n.id === child.parent_id);
  },

  // Apply tree layout to all nodes
  applyLayout: () =>
    set(state => ({
      data: {
        ...state.data,
        nodes: applyTreeLayout(state.data.nodes),
      },
    })),
}));
