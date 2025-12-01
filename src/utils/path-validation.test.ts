/**
 * Unit tests for path validation utilities
 *
 * NOTE: WORKSPACE_PATH env var may be set in local .env file,
 * so we save/restore it to ensure consistent test behavior.
 */

describe('path-validation', () => {
  const originalWorkspacePath = process.env.WORKSPACE_PATH;

  beforeEach(() => {
    // Reset to default /workspace for consistent test behavior
    delete process.env.WORKSPACE_PATH;
    // Clear module cache to re-evaluate WORKSPACE_ROOT
    jest.resetModules();
  });

  afterAll(() => {
    // Restore original env var
    if (originalWorkspacePath !== undefined) {
      process.env.WORKSPACE_PATH = originalWorkspacePath;
    } else {
      delete process.env.WORKSPACE_PATH;
    }
  });

  describe('isPathWithinWorkspace', () => {
    test('should allow paths within /workspace (default)', async () => {
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('/workspace/repo')).toBe(true);
      expect(isPathWithinWorkspace('/workspace/repo/src')).toBe(true);
      expect(isPathWithinWorkspace('/workspace')).toBe(true);
    });

    test('should allow relative paths that resolve within workspace', async () => {
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('repo', '/workspace')).toBe(true);
      expect(isPathWithinWorkspace('./repo', '/workspace')).toBe(true);
      expect(isPathWithinWorkspace('repo/src/file.ts', '/workspace')).toBe(true);
    });

    test('should reject path traversal attempts', async () => {
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('/workspace/../etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('../etc/passwd', '/workspace')).toBe(false);
      expect(isPathWithinWorkspace('/workspace/repo/../../etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('foo/../../../etc/passwd', '/workspace')).toBe(false);
    });

    test('should reject paths outside workspace', async () => {
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('/etc/passwd')).toBe(false);
      expect(isPathWithinWorkspace('/tmp/file')).toBe(false);
      expect(isPathWithinWorkspace('/var/log/syslog')).toBe(false);
    });

    test('should reject paths that look similar but are outside workspace', async () => {
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('/workspace-other')).toBe(false);
      expect(isPathWithinWorkspace('/workspaces')).toBe(false);
      expect(isPathWithinWorkspace('/workspace_backup')).toBe(false);
    });

    test('should use WORKSPACE_PATH env var when set', async () => {
      process.env.WORKSPACE_PATH = '/custom/path';
      jest.resetModules();
      const { isPathWithinWorkspace } = await import('./path-validation');
      expect(isPathWithinWorkspace('/custom/path/repo')).toBe(true);
      expect(isPathWithinWorkspace('/workspace/repo')).toBe(false); // Original path now rejected
    });
  });

  describe('validateAndResolvePath', () => {
    test('should return resolved path for valid paths', async () => {
      const { validateAndResolvePath } = await import('./path-validation');
      expect(validateAndResolvePath('/workspace/repo')).toBe('/workspace/repo');
      expect(validateAndResolvePath('repo', '/workspace')).toBe('/workspace/repo');
      expect(validateAndResolvePath('./src', '/workspace/repo')).toBe('/workspace/repo/src');
    });

    test('should throw for path traversal attempts', async () => {
      const { validateAndResolvePath } = await import('./path-validation');
      expect(() => validateAndResolvePath('../etc/passwd', '/workspace')).toThrow(
        'Path must be within /workspace directory'
      );
      expect(() => validateAndResolvePath('/workspace/../etc/passwd')).toThrow(
        'Path must be within /workspace directory'
      );
    });

    test('should throw for paths outside workspace', async () => {
      const { validateAndResolvePath } = await import('./path-validation');
      expect(() => validateAndResolvePath('/etc/passwd')).toThrow(
        'Path must be within /workspace directory'
      );
      expect(() => validateAndResolvePath('/tmp/evil')).toThrow(
        'Path must be within /workspace directory'
      );
    });

    test('should use custom WORKSPACE_PATH for validation and error message', async () => {
      process.env.WORKSPACE_PATH = '/my/custom/workspace';
      jest.resetModules();
      const { validateAndResolvePath } = await import('./path-validation');
      // Valid path under custom workspace
      expect(validateAndResolvePath('/my/custom/workspace/repo')).toBe('/my/custom/workspace/repo');
      // Path under default workspace should now throw with custom workspace in message
      expect(() => validateAndResolvePath('/workspace/repo')).toThrow(
        'Path must be within /my/custom/workspace directory'
      );
    });
  });
});
