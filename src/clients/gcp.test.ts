/**
 * Tests for GCP client
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { execSync } from 'child_process';

// Mock child_process
jest.mock('child_process');
jest.mock('fs');

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('GCP Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkGCloudAccess', () => {
    test('should detect installed gcloud CLI', async () => {
      const { checkGCloudAccess } = await import('./gcp');

      mockedExecSync.mockReturnValueOnce('Google Cloud SDK 455.0.0\n' as any);
      mockedExecSync.mockReturnValueOnce('user@example.com\n' as any);

      const result = await checkGCloudAccess();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.version).toBe('455.0.0');
    });

    test('should detect unauthenticated gcloud', async () => {
      const { checkGCloudAccess } = await import('./gcp');

      mockedExecSync.mockReturnValueOnce('Google Cloud SDK 455.0.0\n' as any);
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('Not authenticated');
      });

      const result = await checkGCloudAccess();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(false);
    });

    test('should detect missing gcloud CLI', async () => {
      const { checkGCloudAccess } = await import('./gcp');

      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('Command not found');
      });

      const result = await checkGCloudAccess();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('buildAndPushImage', () => {
    test('should build and push image successfully', async () => {
      const { buildAndPushImage } = await import('./gcp');

      const config = {
        enabled: true,
        project_id: 'test-project',
        region: 'us-central1',
        service_name: 'test-service',
      };

      mockedExecSync.mockReturnValue('' as any);

      const result = await buildAndPushImage(
        '/workspace/test',
        'test-project',
        'test-service',
        config
      );

      expect(result.success).toBe(true);
      expect(result.imageUrl).toContain('gcr.io/test-project/test-service');
    });

    test('should handle build failure', async () => {
      const { buildAndPushImage } = await import('./gcp');

      const config = {
        enabled: true,
        project_id: 'test-project',
        region: 'us-central1',
        service_name: 'test-service',
      };

      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('Build failed');
      });

      const result = await buildAndPushImage(
        '/workspace/test',
        'test-project',
        'test-service',
        config
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Build failed');
    });
  });

  describe('getCloudRunService', () => {
    test('should parse service status correctly', async () => {
      const { getCloudRunService } = await import('./gcp');

      const mockServiceData = {
        metadata: {
          name: 'test-service',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        status: {
          url: 'https://test-service-xxx.a.run.app',
          latestCreatedRevisionName: 'test-service-00001-abc',
          traffic: [{ revisionName: 'test-service-00001-abc', percent: 100 }],
          conditions: [{ type: 'Ready', status: 'True' }],
        },
        spec: {
          template: {
            spec: {
              containers: [{ image: 'gcr.io/project/test-service:latest' }],
            },
          },
        },
      };

      mockedExecSync.mockReturnValueOnce(JSON.stringify(mockServiceData) as any);

      const result = await getCloudRunService('project', 'region', 'test-service');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-service');
      expect(result?.ready).toBe(true);
      expect(result?.url).toBe('https://test-service-xxx.a.run.app');
    });
  });
});
