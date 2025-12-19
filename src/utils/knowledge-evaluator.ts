/**
 * Knowledge Evaluator
 *
 * Determines if a detected dependency is worth indexing in Archon's
 * knowledge base based on popularity, stability, and cross-project value.
 */

import { DetectedDependency } from './dependency-detector';

/**
 * Blocklist of dependencies that should NOT be indexed
 * - Internal/proprietary tools
 * - Deprecated libraries
 * - Unstable/experimental frameworks
 */
const BLOCKLIST: string[] = [
  // Deprecated frameworks
  'angularjs', // Old Angular 1.x (deprecated)
  'backbone', // Mostly deprecated
  'knockout', // Deprecated

  // Internal/example tools (add your own)
  'internal-auth-lib',
  'company-framework',

  // Experimental/unstable (can be updated as they stabilize)
  // Note: We're being permissive here - most major frameworks are stable
];

/**
 * Low-value dependencies that are too simple or common to warrant indexing
 * These are typically included in broader documentation (e.g., Node.js docs)
 */
const LOW_VALUE_LIST: string[] = [
  'lodash', // Utility library - simple API, well-known
  'moment', // Deprecated in favor of date-fns/dayjs
  'jquery', // Mostly legacy, less relevant for modern apps
];

/**
 * Evaluates if a dependency should be indexed in Archon
 *
 * Criteria:
 * 1. Not on blocklist (not deprecated/internal)
 * 2. Not low-value (warrants documentation indexing)
 * 3. Has valid documentation URL
 * 4. Category is valuable (frameworks, services, databases have high value)
 *
 * @param dependency - The detected dependency to evaluate
 * @returns true if should index, false otherwise
 */
export function isWorthIndexing(dependency: DetectedDependency): boolean {
  const normalizedName = dependency.name.toLowerCase();
  const normalizedKeywords = dependency.keywords.map(k => k.toLowerCase());

  // Check blocklist
  if (
    BLOCKLIST.some(
      blocked =>
        normalizedName.includes(blocked) || normalizedKeywords.some(k => k.includes(blocked))
    )
  ) {
    return false;
  }

  // Check low-value list
  if (
    LOW_VALUE_LIST.some(
      lowValue =>
        normalizedName.includes(lowValue) || normalizedKeywords.some(k => k.includes(lowValue))
    )
  ) {
    return false;
  }

  // Validate documentation URL exists
  if (!dependency.docsUrl || dependency.docsUrl.length === 0) {
    return false;
  }

  // All categories are valuable for now
  // In the future, we might add category-specific logic
  const valuableCategories = ['framework', 'library', 'service', 'database', 'platform'];
  if (!valuableCategories.includes(dependency.category)) {
    return false;
  }

  // Passed all checks - worth indexing!
  return true;
}

/**
 * Evaluates if a dependency by name should be indexed
 * Simpler alternative when you only have a name
 *
 * @param name - The dependency name (e.g., "react", "supabase")
 * @returns true if should index, false otherwise
 */
export function isWorthIndexingByName(name: string): boolean {
  const normalizedName = name.toLowerCase();

  // Check blocklist
  if (BLOCKLIST.some(blocked => normalizedName.includes(blocked))) {
    return false;
  }

  // Check low-value list
  if (LOW_VALUE_LIST.some(lowValue => normalizedName.includes(lowValue))) {
    return false;
  }

  return true;
}

/**
 * Gets the blocklist (for debugging/configuration)
 *
 * @returns Array of blocked dependency names
 */
export function getBlocklist(): string[] {
  return [...BLOCKLIST];
}

/**
 * Gets the low-value list (for debugging/configuration)
 *
 * @returns Array of low-value dependency names
 */
export function getLowValueList(): string[] {
  return [...LOW_VALUE_LIST];
}
