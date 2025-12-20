/**
 * Tests for Docker command handlers
 */
import {
  handleDockerConfigCommand,
  handleDockerStatusCommand,
  handleDockerLogsCommand,
} from './docker-commands';
import * as docker from '../clients/docker';
import * as codebaseDb from '../db/codebases';
import { Codebase, DockerConfig } from '../types';

// Mock dependencies
jest.mock('../clients/docker');
jest.mock('../db/codebases');

const mockDocker = docker as jest.Mocked<typeof docker>;
const mockCodebaseDb = codebaseDb as jest.Mocked<typeof codebaseDb>;

describe('Docker Commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCodebase: Codebase = {
    id: 'codebase-123',
    name: 'test-project',
    repository_url: 'https://github.com/test/repo',
    default_cwd: '/workspace/test',
    ai_assistant_type: 'claude',
    commands: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockDockerConfig: DockerConfig = {
    enabled: true,
    compose_project: 'testproject',
    compose_file: 'docker-compose.yml',
    containers: {
      backend: {
        service: 'app',
        restart_policy: 'auto',
        health_check_url: 'http://localhost:3000/health',
      },
      postgres: {
        service: 'db',
        restart_policy: 'manual',
      },
    },
    deploy: {
      auto_deploy: false,
      deploy_on_merge: true,
    },
  };

  describe('handleDockerConfigCommand', () => {
    describe('show subcommand', () => {
      it('should show config when Docker is enabled', async () => {
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);

        const result = await handleDockerConfigCommand('codebase-123', ['show']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Docker Configuration');
        expect(result.message).toContain('testproject');
        expect(result.message).toContain('backend');
        expect(result.message).toContain('postgres');
      });

      it('should show not configured message when Docker disabled', async () => {
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.getDockerConfig.mockResolvedValue(null);

        const result = await handleDockerConfigCommand('codebase-123', ['show']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Not configured');
        expect(result.message).toContain('/docker-config set');
      });

      it('should handle missing codebase', async () => {
        const result = await handleDockerConfigCommand(null, ['show']);

        expect(result.success).toBe(false);
        expect(result.message).toContain('No codebase linked');
      });
    });

    describe('set subcommand', () => {
      it('should set Docker config successfully', async () => {
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.findCodebaseByComposeProject.mockResolvedValue(null);
        mockCodebaseDb.updateDockerConfig.mockResolvedValue();

        const result = await handleDockerConfigCommand('codebase-123', [
          'set',
          'myproject',
          'docker-compose.yml',
        ]);

        expect(result.success).toBe(true);
        expect(result.modified).toBe(true);
        expect(result.message).toContain('Docker configuration saved');
        expect(result.message).toContain('myproject');
        expect(mockCodebaseDb.updateDockerConfig).toHaveBeenCalledWith(
          'codebase-123',
          expect.objectContaining({
            enabled: true,
            compose_project: 'myproject',
            compose_file: 'docker-compose.yml',
          })
        );
      });

      it('should use default compose file when not specified', async () => {
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.findCodebaseByComposeProject.mockResolvedValue(null);
        mockCodebaseDb.updateDockerConfig.mockResolvedValue();

        const result = await handleDockerConfigCommand('codebase-123', ['set', 'myproject']);

        expect(result.success).toBe(true);
        expect(mockCodebaseDb.updateDockerConfig).toHaveBeenCalledWith(
          'codebase-123',
          expect.objectContaining({
            compose_file: 'docker-compose.yml',
          })
        );
      });

      it('should reject duplicate compose project', async () => {
        const existingCodebase = { ...mockCodebase, id: 'other-id', name: 'other-project' };
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.findCodebaseByComposeProject.mockResolvedValue(existingCodebase);

        const result = await handleDockerConfigCommand('codebase-123', [
          'set',
          'duplicate-project',
        ]);

        expect(result.success).toBe(false);
        expect(result.message).toContain('already used');
        expect(result.message).toContain('other-project');
      });

      it('should allow updating same codebase compose project', async () => {
        mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
        mockCodebaseDb.findCodebaseByComposeProject.mockResolvedValue(mockCodebase);
        mockCodebaseDb.updateDockerConfig.mockResolvedValue();

        const result = await handleDockerConfigCommand('codebase-123', ['set', 'myproject']);

        expect(result.success).toBe(true);
      });

      it('should return error when compose project not provided', async () => {
        const result = await handleDockerConfigCommand('codebase-123', ['set']);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });
    });

    describe('add-container subcommand', () => {
      it('should add container successfully', async () => {
        mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
        mockCodebaseDb.updateDockerConfig.mockResolvedValue();

        const result = await handleDockerConfigCommand('codebase-123', [
          'add-container',
          'redis',
          'cache',
          'manual',
        ]);

        expect(result.success).toBe(true);
        expect(result.modified).toBe(true);
        expect(result.message).toContain('Container added');
        expect(mockCodebaseDb.updateDockerConfig).toHaveBeenCalledWith(
          'codebase-123',
          expect.objectContaining({
            containers: expect.objectContaining({
              redis: {
                service: 'cache',
                restart_policy: 'manual',
              },
            }),
          })
        );
      });

      it('should use default restart policy when not specified', async () => {
        mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
        mockCodebaseDb.updateDockerConfig.mockResolvedValue();

        const result = await handleDockerConfigCommand('codebase-123', [
          'add-container',
          'redis',
          'cache',
        ]);

        expect(result.success).toBe(true);
        expect(mockCodebaseDb.updateDockerConfig).toHaveBeenCalledWith(
          'codebase-123',
          expect.objectContaining({
            containers: expect.objectContaining({
              redis: expect.objectContaining({
                restart_policy: 'manual',
              }),
            }),
          })
        );
      });

      it('should reject when Docker not configured', async () => {
        mockCodebaseDb.getDockerConfig.mockResolvedValue(null);

        const result = await handleDockerConfigCommand('codebase-123', [
          'add-container',
          'redis',
          'cache',
        ]);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Docker not configured');
      });

      it('should return error when args missing', async () => {
        const result = await handleDockerConfigCommand('codebase-123', ['add-container']);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });
    });

    describe('unknown subcommand', () => {
      it('should return error for unknown subcommand', async () => {
        const result = await handleDockerConfigCommand('codebase-123', ['invalid']);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown subcommand');
      });
    });
  });

  describe('handleDockerStatusCommand', () => {
    it('should show status of all containers', async () => {
      mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getComposeProjectContainers.mockResolvedValue([
        {
          name: 'backend',
          id: 'container-1',
          state: 'running',
          health: 'healthy',
          uptime: '2m 15s',
          ports: [{ internal: 8000, external: 8001 }],
          image: 'test-app:latest',
        },
        {
          name: 'postgres',
          id: 'container-2',
          state: 'running',
          health: 'none',
          uptime: '5m 30s',
          ports: [],
          image: 'postgres:14',
        },
      ]);

      const result = await handleDockerStatusCommand('codebase-123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Production Status');
      expect(result.message).toContain('backend');
      expect(result.message).toContain('postgres');
      expect(result.message).toContain('running');
      expect(result.message).toContain('healthy');
      expect(result.message).toContain('8001→8000');
    });

    it('should show message when no containers running', async () => {
      mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getComposeProjectContainers.mockResolvedValue([]);

      const result = await handleDockerStatusCommand('codebase-123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('No Running Containers');
    });

    it('should handle missing codebase', async () => {
      const result = await handleDockerStatusCommand(null);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No codebase linked');
    });

    it('should handle Docker not configured', async () => {
      mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
      mockCodebaseDb.getDockerConfig.mockResolvedValue(null);

      const result = await handleDockerStatusCommand('codebase-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Docker not configured');
    });

    it('should handle Docker client errors', async () => {
      mockCodebaseDb.getCodebase.mockResolvedValue(mockCodebase);
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getComposeProjectContainers.mockRejectedValue(new Error('Docker daemon not running'));

      const result = await handleDockerStatusCommand('codebase-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error checking Docker status');
      expect(result.message).toContain('Docker daemon not running');
    });
  });

  describe('handleDockerLogsCommand', () => {
    it('should fetch logs from specified container', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getContainerLogs.mockResolvedValue(
        '[2025-12-20 10:00:00] INFO: Server started\n[2025-12-20 10:00:01] INFO: Connected to database'
      );

      const result = await handleDockerLogsCommand('codebase-123', ['backend', '50']);

      expect(result.success).toBe(true);
      expect(result.message).toContain('backend');
      expect(result.message).toContain('Last 50 lines');
      expect(result.message).toContain('Server started');
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith('backend', 50);
    });

    it('should use default line count when not specified', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getContainerLogs.mockResolvedValue('log output');

      const result = await handleDockerLogsCommand('codebase-123', ['backend']);

      expect(result.success).toBe(true);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith('backend', 50);
    });

    it('should auto-select container when not specified', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getComposeProjectContainers.mockResolvedValue([
        {
          name: 'backend',
          id: 'container-1',
          state: 'running',
          health: 'healthy',
          uptime: '1m',
          ports: [],
          image: 'test:latest',
        },
      ]);
      mockDocker.getContainerLogs.mockResolvedValue('log output');

      const result = await handleDockerLogsCommand('codebase-123', []);

      expect(result.success).toBe(true);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith('backend', 50);
    });

    it('should cap line count at 1000', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getContainerLogs.mockResolvedValue('log output');

      const result = await handleDockerLogsCommand('codebase-123', ['backend', '5000']);

      expect(result.success).toBe(true);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith('backend', 1000);
    });

    it('should reject invalid line count', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);

      const result = await handleDockerLogsCommand('codebase-123', ['backend', 'invalid']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid line count');
    });

    it('should reject negative line count', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);

      const result = await handleDockerLogsCommand('codebase-123', ['backend', '-10']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid line count');
    });

    it('should handle missing codebase', async () => {
      const result = await handleDockerLogsCommand(null, ['backend']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No codebase linked');
    });

    it('should handle Docker not configured', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(null);

      const result = await handleDockerLogsCommand('codebase-123', ['backend']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Docker not configured');
    });

    it('should handle no containers found when auto-selecting', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getComposeProjectContainers.mockResolvedValue([]);

      const result = await handleDockerLogsCommand('codebase-123', []);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No containers found');
    });

    it('should handle Docker client errors', async () => {
      mockCodebaseDb.getDockerConfig.mockResolvedValue(mockDockerConfig);
      mockDocker.getContainerLogs.mockRejectedValue(new Error('Container not found'));

      const result = await handleDockerLogsCommand('codebase-123', ['backend']);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error fetching logs');
      expect(result.message).toContain('Container not found');
    });
  });
});
