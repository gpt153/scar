/**
 * Unit tests for GitHub GraphQL utilities
 */
import { getLinkedIssueNumbers } from './github-graphql';
import * as childProcess from 'child_process';

// Mock child_process module
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const mockExecFile = childProcess.execFile as unknown as jest.Mock;

describe('github-graphql', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLinkedIssueNumbers', () => {
    test('returns issue numbers from GraphQL response', async () => {
      // Mock promisified execFile to return successful result
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, { stdout: '42\n45\n', stderr: '' });
        }
      );

      const result = await getLinkedIssueNumbers('owner', 'repo', 123);

      expect(result).toEqual([42, 45]);
      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['api', 'graphql']),
        expect.objectContaining({ timeout: 10000 }),
        expect.any(Function)
      );
    });

    test('returns empty array when no linked issues', async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, { stdout: '', stderr: '' });
        }
      );

      const result = await getLinkedIssueNumbers('owner', 'repo', 123);

      expect(result).toEqual([]);
    });

    test('returns empty array on error (graceful degradation)', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, callback: (err: Error | null) => void) => {
          callback(new Error('gh: command not found'));
        }
      );

      // Should not throw, should return empty array
      const result = await getLinkedIssueNumbers('owner', 'repo', 123);

      expect(result).toEqual([]);
    });

    test('filters out invalid numbers', async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, { stdout: '42\nnot-a-number\n45\n', stderr: '' });
        }
      );

      const result = await getLinkedIssueNumbers('owner', 'repo', 123);

      expect(result).toEqual([42, 45]);
    });

    test('handles single issue number', async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, { stdout: '99\n', stderr: '' });
        }
      );

      const result = await getLinkedIssueNumbers('owner', 'repo', 123);

      expect(result).toEqual([99]);
    });

    test('passes correct parameters to gh CLI', async () => {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, { stdout: '', stderr: '' });
        }
      );

      await getLinkedIssueNumbers('myowner', 'myrepo', 456);

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['-F', 'owner=myowner', '-F', 'repo=myrepo', '-F', 'pr=456']),
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
