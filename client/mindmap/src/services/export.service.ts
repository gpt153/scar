import type { MindMapData, MindMapNode } from '@/types/mindmap.types';

/**
 * Export service for mind map data
 * Supports JSON, Markdown, and plan-feature formats
 */

export class ExportService {
  /**
   * Export as JSON (save/load)
   */
  static exportJSON(data: MindMapData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export as Markdown (human-readable)
   */
  static exportMarkdown(data: MindMapData): string {
    let markdown = `# ${data.project.name}\n\n`;
    markdown += `${data.project.description}\n\n`;
    markdown += `---\n\n`;

    const rootNodes = data.nodes.filter(n => n.parent_id === null);

    const renderNode = (node: MindMapNode, level: number): string => {
      const indent = '  '.repeat(level);
      let output = `${indent}- **${node.label}**\n`;
      if (node.description) {
        output += `${indent}  ${node.description}\n`;
      }

      const children = data.nodes.filter(n => n.parent_id === node.id);
      children.forEach(child => {
        output += renderNode(child, level + 1);
      });

      return output;
    };

    rootNodes.forEach(root => {
      markdown += renderNode(root, 0);
    });

    return markdown;
  }

  /**
   * Export as plan-feature format (for /core_piv_loop:plan-feature)
   */
  static exportPlanFeature(data: MindMapData, selectedNodeId?: string): string {
    const rootNode = selectedNodeId
      ? data.nodes.find(n => n.id === selectedNodeId)
      : data.nodes.find(n => n.parent_id === null);

    if (!rootNode) {
      return `Feature: ${data.project.name}\n\n${data.project.description}`;
    }

    let output = `Feature: ${rootNode.label}\n\n`;
    output += `Description: ${rootNode.description}\n\n`;

    const children = data.nodes.filter(n => n.parent_id === rootNode.id);
    if (children.length > 0) {
      output += `## Sub-Features\n\n`;
      children.forEach(child => {
        output += `### ${child.label}\n`;
        output += `${child.description}\n\n`;

        const grandchildren = data.nodes.filter(n => n.parent_id === child.id);
        if (grandchildren.length > 0) {
          output += `**Components:**\n`;
          grandchildren.forEach(gc => {
            output += `- ${gc.label}: ${gc.description}\n`;
          });
          output += `\n`;
        }
      });
    }

    const parent = data.nodes.find(n => n.id === rootNode.parent_id);
    if (parent) {
      output += `## Context\n\n`;
      output += `Part of: ${parent.label}\n`;
    }

    return output;
  }

  /**
   * Download file to browser
   */
  static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
