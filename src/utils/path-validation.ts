/**
 * Path validation utilities to prevent path traversal attacks
 */
import { resolve } from 'path';

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || '/workspace';

/**
 * Validates that a resolved path stays within the allowed workspace directory.
 * Prevents path traversal attacks using sequences like "../"
 *
 * @param targetPath - The path to validate (can be absolute or relative)
 * @param basePath - Optional base path to resolve relative paths against (defaults to /workspace)
 * @returns true if path is within workspace, false otherwise
 */
export function isPathWithinWorkspace(
  targetPath: string,
  basePath: string = WORKSPACE_ROOT
): boolean {
  // Resolve to absolute path
  const resolvedTarget = resolve(basePath, targetPath);
  const resolvedWorkspace = resolve(WORKSPACE_ROOT);

  // Check if resolved path starts with workspace root
  // Use trailing slash to prevent matching /workspace-other
  return (
    resolvedTarget === resolvedWorkspace ||
    resolvedTarget.startsWith(resolvedWorkspace + '/')
  );
}

/**
 * Validates a path and returns the resolved absolute path if valid.
 * Throws an error if the path escapes the workspace.
 *
 * @param targetPath - The path to validate
 * @param basePath - Optional base path to resolve relative paths against
 * @returns The resolved absolute path
 * @throws Error if path is outside workspace
 */
export function validateAndResolvePath(
  targetPath: string,
  basePath: string = WORKSPACE_ROOT
): string {
  const resolvedPath = resolve(basePath, targetPath);

  if (!isPathWithinWorkspace(resolvedPath)) {
    throw new Error(`Path must be within ${WORKSPACE_ROOT} directory`);
  }

  return resolvedPath;
}
