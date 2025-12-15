import type { MindMapNode } from '@/types/mindmap.types';

/**
 * Auto-layout nodes in a tree structure
 * - Root at top center
 * - Children arranged horizontally below parent
 * - Each level has consistent vertical spacing
 */

interface LayoutNode extends MindMapNode {
  children?: LayoutNode[];
  _width?: number;
}

const LEVEL_HEIGHT = 150; // Vertical space between levels
const NODE_WIDTH = 250; // Approximate node width
const SIBLING_SPACING = 50; // Horizontal space between siblings

/**
 * Build tree structure from flat node list
 */
function buildTree(nodes: MindMapNode[]): LayoutNode[] {
  const nodeMap = new Map<string, LayoutNode>();
  const roots: LayoutNode[] = [];

  // Create node map
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Build parent-child relationships
  nodes.forEach(node => {
    const layoutNode = nodeMap.get(node.id)!;
    if (node.parent_id) {
      const parent = nodeMap.get(node.parent_id);
      if (parent) {
        parent.children!.push(layoutNode);
      } else {
        roots.push(layoutNode);
      }
    } else {
      roots.push(layoutNode);
    }
  });

  return roots;
}

/**
 * Calculate subtree width (for centering children under parent)
 */
function calculateWidth(node: LayoutNode): number {
  if (!node.children || node.children.length === 0) {
    node._width = NODE_WIDTH;
    return NODE_WIDTH;
  }

  // Calculate total width of all children
  const childrenWidth = node.children.reduce((sum, child) => {
    return sum + calculateWidth(child);
  }, 0);

  // Add spacing between children
  const totalWidth = childrenWidth + SIBLING_SPACING * (node.children.length - 1);
  node._width = Math.max(NODE_WIDTH, totalWidth);
  return node._width;
}

/**
 * Position nodes in tree layout
 */
function positionNode(
  node: LayoutNode,
  x: number,
  y: number,
  positions: Map<string, { x: number; y: number }>
): void {
  // Position current node
  positions.set(node.id, { x, y });

  // Position children
  if (node.children && node.children.length > 0) {
    const totalWidth = node._width || NODE_WIDTH;
    let currentX = x - totalWidth / 2;

    node.children.forEach(child => {
      const childWidth = child._width || NODE_WIDTH;
      const childCenterX = currentX + childWidth / 2;

      positionNode(child, childCenterX, y + LEVEL_HEIGHT, positions);

      currentX += childWidth + SIBLING_SPACING;
    });
  }
}

/**
 * Apply tree layout to all nodes
 */
export function applyTreeLayout(nodes: MindMapNode[]): MindMapNode[] {
  if (nodes.length === 0) return nodes;

  const roots = buildTree(nodes);
  const positions = new Map<string, { x: number; y: number }>();

  // Calculate widths for all nodes
  roots.forEach(root => calculateWidth(root));

  // Position nodes starting from roots
  let currentX = 300; // Start position for first root
  roots.forEach(root => {
    const rootWidth = root._width || NODE_WIDTH;
    positionNode(root, currentX, 100, positions);
    currentX += rootWidth + SIBLING_SPACING * 3; // Extra spacing between root trees
  });

  // Apply positions to nodes
  return nodes.map(node => ({
    ...node,
    position: positions.get(node.id) || node.position,
  }));
}
