/**
 * Unit tests for path validation utilities
 */
import { isPathWithinWorkspace, validateAndResolvePath } from './path-validation';

describe('path-validation', () => {
  describe('isPathWithinWorkspace', () => {
    test('should allow paths within /workspace', () => {
      expect(isPathWithinWorkspace('/workspace/repo')).toBe(true);
      expect(isPathWithinWorkspace('/workspace/repo/src')).toBe(true);
      expect(isPathWithinWorkspace('/workspace')).toBe(true);
    });

    test('should allow relative paths that resolve within workspace', () => {
      expect(isPathWithinWorkspace('repo', '/workspace')).toBe(true);
      expect(isPathWithinWorkspace('./repo', '/workspace')).toBe(true);
      expect(isPathWithinWorkspace('repo/src/file.ts', '/workspace')).toBe(true);
    });

    test('should reject path traversal attempts', () => {
      expect(isPathWithinWorkspace('/workspace/../etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('../etc/passwd', '/workspace')).toBe(false);
      expect(isPathWithinWorkspace('/workspace/repo/../../etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('foo/../../../etc/passwd', '/workspace')).toBe(false);
    });

    test('should reject paths outside workspace', () => {
      expect(isPathWithinWorkspace('/etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('/tmp/file')).toBe(false);
      expect(isPathWithinWorkspace('/var/log/syslog')).toBe(false);
    });

    test('should reject paths that look similar but are outside workspace', () => {
      expect(isPathWithinWorkspace('/workspace-other')).toBe(false);
      expect(isPathWithinWorkspace('/workspaces')).toBe(false);
      expect(isPathWithinWorkspace('/workspace_backup')).toBe(false);
    });
  });

  describe('validateAndResolvePath', () => {
    test('should return resolved path for valid paths', () => {
      expect(validateAndResolvePath('/workspace/repo')).toBe('/workspace/repo');
      expect(validateAndResolvePath('repo', '/workspace')).toBe('/workspace/repo');
      expect(validateAndResolvePath('./src', '/workspace/repo')).toBe('/workspace/repo/src');
    });

    test('should throw for path traversal attempts', () => {
      expect(() => validateAndResolvePath('../etc/passwd', '/workspace')).toThrow(
        'Path must be within /workspace directory'
      );
      expect(() => validateAndResolvePath('/workspace/../etc/passwd')).toThrow(
        'Path must be within /workspace directory'
      );
    });

    test('should throw for paths outside workspace', () => {
      expect(() => validateAndResolvePath('/etc/passwd')).toThrow(
        'Path must be within /workspace directory'
      );
      expect(() => validateAndResolvePath('/tmp/evil')).toThrow(
        'Path must be within /workspace directory'
      );
    });
  });
});
