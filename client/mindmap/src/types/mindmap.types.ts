/**
 * Mind map data structures with future Archon integration support
 */

export interface MindMapProject {
  name: string;
  description: string;
  created_at: string; // ISO-8601
  updated_at?: string; // ISO-8601
}

export interface MindMapNode {
  id: string;
  type: 'root' | 'feature' | 'component' | 'detail';
  label: string;
  description: string;
  parent_id: string | null;
  metadata: {
    status: 'planned' | 'doing' | 'review' | 'done';
    archon_project_id: string | null; // Future: link to Archon project
    archon_task_ids: string[]; // Future: link to Archon tasks
    commands: string[]; // Future: track which commands executed
    expanded: boolean; // UI state: is node showing children?
  };
  position: {
    x: number;
    y: number;
  };
}

export interface MindMapEdge {
  id: string;
  source: string; // parent node id
  target: string; // child node id
  type: 'parent-child' | 'dependency';
}

export interface MindMapData {
  version: string;
  project: MindMapProject;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

export interface MindMapContext {
  currentNode: MindMapNode | null;
  parentNode: MindMapNode | null;
  childNodes: MindMapNode[];
  siblingNodes: MindMapNode[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}
