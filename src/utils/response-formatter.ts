/**
 * Response formatting utilities for non-technical audiences
 */

/**
 * Strip code blocks and replace with summary messages
 */
export function stripCodeBlocks(message: string): string {
  // Remove fenced code blocks (```...```)
  message = message.replace(/```[\s\S]*?```/g, '[Code changes made - use /show-changes to see details]');

  // Remove inline code (`...`)
  message = message.replace(/`[^`]+`/g, (match) => {
    // Preserve file paths and commands starting with /
    if (match.includes('/') || match.startsWith('`/')) {
      return match;
    }
    return match.replace(/`/g, '');
  });

  return message;
}

/**
 * Enhance summaries with "what and why" context for non-technical readers
 * Example: "Created 3 files" → "Created 3 files for the search filter feature (FilterService, UI component, and tests) to enable users to narrow down search results"
 */
export function enhanceSummary(message: string): string {
  // Keep original message (AI should provide context)
  // This function is a hook for future enhancements
  // Future: Could add pattern-based enhancements here
  return message;
}

/**
 * Format response for non-technical decision maker
 * - Strip code blocks
 * - Keep natural language explanations
 * - Ensure "what and why" context is present
 */
export function formatForNonTechnical(message: string): string {
  let formatted = stripCodeBlocks(message);
  formatted = enhanceSummary(formatted);
  return formatted;
}
