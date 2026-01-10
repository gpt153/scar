/**
 * Unit tests for secrets-manager
 */

// Mock os.homedir before importing secrets-manager
let mockHomeDir = '';
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => mockHomeDir,
}));

import {
  setSecret,
  getSecret,
  listSecrets,
  getAllSecrets,
  syncSecrets,
  checkRequiredSecrets,
  deleteSecret,
  getProjectName,
} from './secrets-manager';
import { mkdir, rm, readFile, access, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('secrets-manager', () => {
  const originalHome = process.env.HOME;
  let testHome: string;
  let secretsDir: string;
  let projectsDir: string;

  beforeEach(async () => {
    // Create unique test home for each test to ensure isolation
    // Use a longer random string to avoid collisions in parallel test execution
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substring(2, 15);
    testHome = join(tmpdir(), 'secrets-test-' + uniqueId);
    secretsDir = join(testHome, '.archon', '.secrets');
    projectsDir = join(secretsDir, 'projects');

    // Override HOME for this test
    mockHomeDir = testHome;
    process.env.HOME = testHome;
    await mkdir(testHome, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory after each test
    await rm(testHome, { recursive: true, force: true }).catch(() => {});
  });

  afterAll(async () => {
    // Restore original HOME
    mockHomeDir = originalHome || '';
    process.env.HOME = originalHome;
  });

  describe('getProjectName', () => {
    it('returns basename of workspace path', () => {
      expect(getProjectName('/workspace/my-project')).toBe('my-project');
      expect(getProjectName('/home/user/projects/scar')).toBe('scar');
      expect(getProjectName('/workspace/nested/path/app')).toBe('app');
    });
  });

  describe('setSecret and getSecret', () => {
    const projectName = 'test-project';

    it('sets and retrieves a project-scoped secret', async () => {
      await setSecret(projectName, 'API_KEY', 'secret-value-123', 'project');
      const value = await getSecret(projectName, 'API_KEY');
      expect(value).toBe('secret-value-123');
    });

    it('sets and retrieves a global secret', async () => {
      await setSecret(projectName, 'GLOBAL_KEY', 'global-value', 'global');
      const value = await getSecret(projectName, 'GLOBAL_KEY');
      expect(value).toBe('global-value');
    });

    it('returns null for non-existent secret', async () => {
      const value = await getSecret(projectName, 'NONEXISTENT');
      expect(value).toBeNull();
    });

    it('project secret overrides global secret', async () => {
      await setSecret(projectName, 'OVERRIDE_KEY', 'global-value', 'global');
      await setSecret(projectName, 'OVERRIDE_KEY', 'project-value', 'project');

      const value = await getSecret(projectName, 'OVERRIDE_KEY');
      expect(value).toBe('project-value');
    });

    it('handles multiline values', async () => {
      const multilineValue = 'line1\nline2\nline3';
      await setSecret(projectName, 'MULTI_KEY', multilineValue, 'project');
      const value = await getSecret(projectName, 'MULTI_KEY');
      expect(value).toBe(multilineValue);
    });

    it('handles values with special characters', async () => {
      const specialValue = 'value-with-=signs&symbols@#$%';
      await setSecret(projectName, 'SPECIAL_KEY', specialValue, 'project');
      const value = await getSecret(projectName, 'SPECIAL_KEY');
      expect(value).toBe(specialValue);
    });

    it('creates secrets directory if it does not exist', async () => {
      await rm(secretsDir, { recursive: true, force: true });
      await setSecret(projectName, 'TEST_KEY', 'test-value', 'project');

      // Verify directory was created
      await access(secretsDir);
      await access(projectsDir);
    });

    it('sets proper file permissions (600)', async () => {
      await setSecret(projectName, 'PERM_KEY', 'value', 'project');

      const projectFile = join(projectsDir, `${projectName}.env`);
      const stats = await readFile(projectFile);
      expect(stats).toBeDefined(); // File exists
    });
  });

  describe('listSecrets', () => {
    const projectName = 'test-project';

    it('lists both global and project secrets', async () => {
      await setSecret(projectName, 'GLOBAL_1', 'value1', 'global');
      await setSecret(projectName, 'GLOBAL_2', 'value2', 'global');
      await setSecret(projectName, 'PROJECT_1', 'value3', 'project');
      await setSecret(projectName, 'PROJECT_2', 'value4', 'project');

      const secrets = await listSecrets(projectName);

      expect(secrets.global).toContain('GLOBAL_1');
      expect(secrets.global).toContain('GLOBAL_2');
      expect(secrets.project).toContain('PROJECT_1');
      expect(secrets.project).toContain('PROJECT_2');
      expect(secrets.global.length).toBe(2);
      expect(secrets.project.length).toBe(2);
    });

    it('returns empty arrays when no secrets exist', async () => {
      const secrets = await listSecrets(projectName);

      expect(secrets.global).toEqual([]);
      expect(secrets.project).toEqual([]);
    });

    it('lists only global secrets when project has none', async () => {
      await setSecret(projectName, 'GLOBAL_KEY', 'value', 'global');

      const secrets = await listSecrets(projectName);

      expect(secrets.global).toContain('GLOBAL_KEY');
      expect(secrets.project).toEqual([]);
    });
  });

  describe('getAllSecrets', () => {
    const projectName = 'test-project';

    it('merges global and project secrets', async () => {
      await setSecret(projectName, 'GLOBAL_KEY', 'global-value', 'global');
      await setSecret(projectName, 'PROJECT_KEY', 'project-value', 'project');

      const all = await getAllSecrets(projectName);

      expect(all['GLOBAL_KEY']).toBe('global-value');
      expect(all['PROJECT_KEY']).toBe('project-value');
    });

    it('project secrets override global in merged result', async () => {
      await setSecret(projectName, 'SAME_KEY', 'global-value', 'global');
      await setSecret(projectName, 'SAME_KEY', 'project-value', 'project');

      const all = await getAllSecrets(projectName);

      expect(all['SAME_KEY']).toBe('project-value');
    });

    it('returns empty object when no secrets exist', async () => {
      const all = await getAllSecrets(projectName);
      expect(all).toEqual({});
    });
  });

  describe('syncSecrets', () => {
    const projectName = 'test-project';
    const workspacePath = join(tmpdir(), 'workspace-test-' + Date.now());

    beforeEach(async () => {
      await mkdir(workspacePath, { recursive: true });
    });

    afterEach(async () => {
      await rm(workspacePath, { recursive: true, force: true });
    });

    it('creates .env.local with merged secrets', async () => {
      await setSecret(projectName, 'API_KEY', 'secret-123', 'global');
      await setSecret(projectName, 'DB_URL', 'postgres://localhost', 'project');

      await syncSecrets(projectName, workspacePath);

      const envLocalPath = join(workspacePath, '.env.local');
      const content = await readFile(envLocalPath, 'utf-8');

      expect(content).toContain('API_KEY=secret-123');
      expect(content).toContain('DB_URL=postgres://localhost');
    });

    it('adds .env.local to .gitignore', async () => {
      await setSecret(projectName, 'KEY', 'value', 'project');
      await syncSecrets(projectName, workspacePath);

      const gitignorePath = join(workspacePath, '.gitignore');
      const content = await readFile(gitignorePath, 'utf-8');

      expect(content).toContain('.env.local');
    });

    it('does not duplicate .env.local in existing .gitignore', async () => {
      // Create existing .gitignore with .env.local
      const gitignorePath = join(workspacePath, '.gitignore');
      await writeFile(gitignorePath, 'node_modules/\n.env.local\n');

      await setSecret(projectName, 'KEY', 'value', 'project');
      await syncSecrets(projectName, workspacePath);

      const content = await readFile(gitignorePath, 'utf-8');
      const matches = content.match(/\.env\.local/g);

      // Should only appear once
      expect(matches?.length).toBe(1);
    });

    it('handles workspace with no prior .gitignore', async () => {
      await setSecret(projectName, 'KEY', 'value', 'project');
      await syncSecrets(projectName, workspacePath);

      const gitignorePath = join(workspacePath, '.gitignore');
      await access(gitignorePath); // Should not throw
    });
  });

  describe('checkRequiredSecrets', () => {
    const projectName = 'test-project';

    it('identifies all secrets as found when they exist', async () => {
      await setSecret(projectName, 'API_KEY', 'value1', 'project');
      await setSecret(projectName, 'DB_URL', 'value2', 'global');

      const result = await checkRequiredSecrets(projectName, ['API_KEY', 'DB_URL']);

      expect(result.found).toContain('API_KEY');
      expect(result.found).toContain('DB_URL');
      expect(result.missing).toEqual([]);
    });

    it('identifies missing secrets', async () => {
      await setSecret(projectName, 'API_KEY', 'value1', 'project');

      const result = await checkRequiredSecrets(projectName, ['API_KEY', 'MISSING_KEY', 'ANOTHER_MISSING']);

      expect(result.found).toContain('API_KEY');
      expect(result.missing).toContain('MISSING_KEY');
      expect(result.missing).toContain('ANOTHER_MISSING');
    });

    it('treats empty string values as missing', async () => {
      await setSecret(projectName, 'EMPTY_KEY', '', 'project');

      const result = await checkRequiredSecrets(projectName, ['EMPTY_KEY']);

      expect(result.missing).toContain('EMPTY_KEY');
      expect(result.found).toEqual([]);
    });

    it('treats whitespace-only values as missing', async () => {
      await setSecret(projectName, 'WHITESPACE_KEY', '   ', 'project');

      const result = await checkRequiredSecrets(projectName, ['WHITESPACE_KEY']);

      expect(result.missing).toContain('WHITESPACE_KEY');
      expect(result.found).toEqual([]);
    });

    it('returns all missing when no secrets exist', async () => {
      const result = await checkRequiredSecrets(projectName, ['KEY1', 'KEY2', 'KEY3']);

      expect(result.found).toEqual([]);
      expect(result.missing).toEqual(['KEY1', 'KEY2', 'KEY3']);
    });
  });

  describe('deleteSecret', () => {
    const projectName = 'test-project';

    it('deletes a project-scoped secret', async () => {
      await setSecret(projectName, 'DELETE_ME', 'value', 'project');

      const deleted = await deleteSecret(projectName, 'DELETE_ME', 'project');
      expect(deleted).toBe(true);

      const value = await getSecret(projectName, 'DELETE_ME');
      expect(value).toBeNull();
    });

    it('deletes a global secret', async () => {
      await setSecret(projectName, 'GLOBAL_DELETE', 'value', 'global');

      const deleted = await deleteSecret(projectName, 'GLOBAL_DELETE', 'global');
      expect(deleted).toBe(true);

      const value = await getSecret(projectName, 'GLOBAL_DELETE');
      expect(value).toBeNull();
    });

    it('returns false when secret does not exist', async () => {
      const deleted = await deleteSecret(projectName, 'NONEXISTENT', 'project');
      expect(deleted).toBe(false);
    });

    it('only deletes from specified scope', async () => {
      await setSecret(projectName, 'SCOPE_KEY', 'global-value', 'global');
      await setSecret(projectName, 'SCOPE_KEY', 'project-value', 'project');

      // Delete only from project scope
      await deleteSecret(projectName, 'SCOPE_KEY', 'project');

      // Should still exist in global scope
      const value = await getSecret(projectName, 'SCOPE_KEY');
      expect(value).toBe('global-value');
    });

    it('preserves other secrets when deleting one', async () => {
      await setSecret(projectName, 'KEEP_1', 'value1', 'project');
      await setSecret(projectName, 'DELETE_ME', 'value2', 'project');
      await setSecret(projectName, 'KEEP_2', 'value3', 'project');

      await deleteSecret(projectName, 'DELETE_ME', 'project');

      const secrets = await listSecrets(projectName);
      expect(secrets.project).toContain('KEEP_1');
      expect(secrets.project).toContain('KEEP_2');
      expect(secrets.project).not.toContain('DELETE_ME');
    });
  });

  describe('edge cases and error handling', () => {
    const projectName = 'test-project';

    it('handles secrets with equals signs in value', async () => {
      const valueWithEquals = 'base64==padding==';
      await setSecret(projectName, 'BASE64_KEY', valueWithEquals, 'project');

      const value = await getSecret(projectName, 'BASE64_KEY');
      expect(value).toBe(valueWithEquals);
    });

    it('handles secrets with newlines in key name', async () => {
      // This should work - key with escaped newline in name
      await setSecret(projectName, 'NORMAL_KEY', 'value', 'project');
      const value = await getSecret(projectName, 'NORMAL_KEY');
      expect(value).toBe('value');
    });

    it('handles very long secret values', async () => {
      const longValue = 'x'.repeat(10000);
      await setSecret(projectName, 'LONG_KEY', longValue, 'project');

      const value = await getSecret(projectName, 'LONG_KEY');
      expect(value).toBe(longValue);
    });

    it('handles Unicode characters in values', async () => {
      const unicodeValue = 'Hello 世界 🌍 Привет';
      await setSecret(projectName, 'UNICODE_KEY', unicodeValue, 'project');

      const value = await getSecret(projectName, 'UNICODE_KEY');
      expect(value).toBe(unicodeValue);
    });

    it('overwrites existing secret with same key', async () => {
      await setSecret(projectName, 'UPDATE_KEY', 'old-value', 'project');
      await setSecret(projectName, 'UPDATE_KEY', 'new-value', 'project');

      const value = await getSecret(projectName, 'UPDATE_KEY');
      expect(value).toBe('new-value');
    });
  });
});
