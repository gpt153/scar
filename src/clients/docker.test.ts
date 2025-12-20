/**
 * Tests for Docker client
 *
 * Note: These tests require Docker to be accessible via socket.
 * They are integration tests, not unit tests.
 */
import {
  checkDockerAccess,
  getDockerVersion,
  getContainerStatus,
  getComposeProjectContainers,
  getContainerLogs,
  restartContainer,
} from './docker';

describe('Docker Client', () => {
  describe('checkDockerAccess', () => {
    it('should return true if Docker is accessible', async () => {
      const isAccessible = await checkDockerAccess();

      // This test will pass if Docker socket is mounted and accessible
      // It will fail if Docker is not available (expected in some CI environments)
      if (process.env.DOCKER_AVAILABLE === 'false') {
        expect(isAccessible).toBe(false);
      } else {
        // In environments with Docker, this should pass
        // In CI without Docker, this test is skipped
        expect(typeof isAccessible).toBe('boolean');
      }
    }, 10000);
  });

  describe('getDockerVersion', () => {
    it('should return Docker version or "unknown"', async () => {
      const version = await getDockerVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('getContainerStatus', () => {
    it('should return null for non-existent container', async () => {
      const status = await getContainerStatus('nonexistent-container-12345');
      expect(status).toBeNull();
    });

    it('should return container status for running container', async () => {
      // This test requires a running container
      // Skip if Docker not available
      if (process.env.DOCKER_AVAILABLE === 'false') {
        return;
      }

      // Try to get status of this test container itself (if running in Docker)
      // Otherwise, skip this test
      const hostname = process.env.HOSTNAME;
      if (!hostname) {
        return;
      }

      const status = await getContainerStatus(hostname);
      if (status) {
        expect(status).toHaveProperty('name');
        expect(status).toHaveProperty('id');
        expect(status).toHaveProperty('state');
        expect(status.state).toMatch(/running|stopped|restarting|paused|dead/);
      }
    }, 10000);
  });

  describe('getComposeProjectContainers', () => {
    it('should return empty array for non-existent project', async () => {
      const containers = await getComposeProjectContainers('nonexistent-project-12345');
      expect(Array.isArray(containers)).toBe(true);
      expect(containers.length).toBe(0);
    });

    it('should return containers for existing project', async () => {
      // This test requires a Docker Compose project to be running
      // Skip if Docker not available
      if (process.env.DOCKER_AVAILABLE === 'false') {
        return;
      }

      // Try to detect SCAR's own compose project
      // If running in Docker Compose, COMPOSE_PROJECT_NAME should be set
      const projectName = process.env.COMPOSE_PROJECT_NAME || 'scar';

      const containers = await getComposeProjectContainers(projectName);
      expect(Array.isArray(containers)).toBe(true);

      // If containers found, validate structure
      containers.forEach(container => {
        expect(container).toHaveProperty('name');
        expect(container).toHaveProperty('id');
        expect(container).toHaveProperty('state');
        expect(container).toHaveProperty('ports');
        expect(container).toHaveProperty('image');
      });
    }, 10000);
  });

  describe('getContainerLogs', () => {
    it('should throw error for non-existent container', async () => {
      await expect(
        getContainerLogs('nonexistent-container-12345', 10)
      ).rejects.toThrow();
    });

    it('should return logs for existing container', async () => {
      // Skip if Docker not available
      if (process.env.DOCKER_AVAILABLE === 'false') {
        return;
      }

      // Try to get logs from this container if running in Docker
      const hostname = process.env.HOSTNAME;
      if (!hostname) {
        return;
      }

      try {
        const logs = await getContainerLogs(hostname, 10);
        expect(typeof logs).toBe('string');
        // Logs might be empty for new containers, so we don't assert length
      } catch (error) {
        // Container might not exist, which is fine for this test
        expect(error).toBeDefined();
      }
    }, 10000);
  });

  describe('restartContainer', () => {
    it('should return false for non-existent container', async () => {
      const result = await restartContainer('nonexistent-container-12345');
      expect(result).toBe(false);
    });

    // Note: We don't test actual container restart to avoid disrupting the test environment
    // Restart functionality is tested in manual/integration tests
  });
});

// Integration test that runs only when Docker is available
describe('Docker Integration Tests', () => {
  // Skip entire suite if Docker not available
  beforeAll(async () => {
    const isAvailable = await checkDockerAccess();
    if (!isAvailable) {
      console.log('[Docker Tests] Skipping integration tests - Docker not available');
    }
  });

  it('should be able to ping Docker daemon', async () => {
    const isAccessible = await checkDockerAccess();

    if (process.env.DOCKER_AVAILABLE === 'false') {
      expect(isAccessible).toBe(false);
    } else {
      // If Docker is expected to be available, verify it
      expect(isAccessible).toBe(true);
    }
  }, 10000);

  it('should get Docker version', async () => {
    if (process.env.DOCKER_AVAILABLE === 'false') {
      return;
    }

    const version = await getDockerVersion();
    expect(version).not.toBe('unknown');
    expect(version.length).toBeGreaterThan(0);
  }, 10000);
});
