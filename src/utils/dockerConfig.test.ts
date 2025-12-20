/**
 * Tests for Docker configuration utilities
 */
import {
  validateDockerConfig,
  createDefaultDockerConfig,
  addContainerToConfig,
  removeContainerFromConfig,
  isDockerEnabled,
  getContainerConfig,
  getContainerNames,
  isAutoDeployEnabled,
  isDeployOnMergeEnabled,
  serializeDockerConfig,
  deserializeDockerConfig,
} from './dockerConfig';
import { DockerConfig } from '../types';

describe('Docker Configuration Utilities', () => {
  describe('validateDockerConfig', () => {
    it('should accept valid minimal config (disabled)', () => {
      const config = { enabled: false };
      expect(validateDockerConfig(config)).toBe(true);
    });

    it('should accept valid full config', () => {
      const config: DockerConfig = {
        enabled: true,
        compose_project: 'myproject',
        compose_file: 'docker-compose.yml',
        containers: {
          backend: {
            service: 'api',
            restart_policy: 'auto',
            health_check_url: 'http://localhost:3000/health',
          },
          frontend: {
            service: 'web',
            restart_policy: 'manual',
          },
        },
        deploy: {
          auto_deploy: true,
          deploy_on_merge: true,
          build_command: 'npm run build',
          pre_deploy_command: 'npm run migrate',
          post_deploy_command: 'npm run health-check',
        },
      };

      expect(validateDockerConfig(config)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(validateDockerConfig(null)).toBe(false);
      expect(validateDockerConfig(undefined)).toBe(false);
    });

    it('should reject config without enabled field', () => {
      const config = {
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject enabled config without compose_project', () => {
      const config = {
        enabled: true,
        compose_file: 'docker-compose.yml',
        containers: {},
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject enabled config without compose_file', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        containers: {},
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject enabled config without containers', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject container config without service', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {
          backend: {
            restart_policy: 'auto',
          },
        },
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject container config without restart_policy', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {
          backend: {
            service: 'api',
          },
        },
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject container config with invalid restart_policy', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {
          backend: {
            service: 'api',
            restart_policy: 'invalid',
          },
        },
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject deploy config without auto_deploy', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {},
        deploy: {
          deploy_on_merge: true,
        },
      };
      expect(validateDockerConfig(config)).toBe(false);
    });

    it('should reject deploy config without deploy_on_merge', () => {
      const config = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {},
        deploy: {
          auto_deploy: true,
        },
      };
      expect(validateDockerConfig(config)).toBe(false);
    });
  });

  describe('createDefaultDockerConfig', () => {
    it('should create valid default config', () => {
      const config = createDefaultDockerConfig('myproject');

      expect(config.enabled).toBe(true);
      expect(config.compose_project).toBe('myproject');
      expect(config.compose_file).toBe('docker-compose.yml');
      expect(config.containers).toEqual({});
      expect(config.deploy?.auto_deploy).toBe(false);
      expect(config.deploy?.deploy_on_merge).toBe(false);
      expect(validateDockerConfig(config)).toBe(true);
    });

    it('should accept custom compose file path', () => {
      const config = createDefaultDockerConfig('myproject', 'docker/production.yml');

      expect(config.compose_file).toBe('docker/production.yml');
      expect(validateDockerConfig(config)).toBe(true);
    });
  });

  describe('addContainerToConfig', () => {
    it('should add container with minimal config', () => {
      const baseConfig = createDefaultDockerConfig('test');
      const updated = addContainerToConfig(baseConfig, 'backend', 'api');

      expect(updated.containers.backend).toBeDefined();
      expect(updated.containers.backend.service).toBe('api');
      expect(updated.containers.backend.restart_policy).toBe('manual');
      expect(updated.containers.backend.health_check_url).toBeUndefined();
      expect(validateDockerConfig(updated)).toBe(true);
    });

    it('should add container with full config', () => {
      const baseConfig = createDefaultDockerConfig('test');
      const updated = addContainerToConfig(
        baseConfig,
        'backend',
        'api',
        'auto',
        'http://localhost:3000/health'
      );

      expect(updated.containers.backend).toBeDefined();
      expect(updated.containers.backend.service).toBe('api');
      expect(updated.containers.backend.restart_policy).toBe('auto');
      expect(updated.containers.backend.health_check_url).toBe('http://localhost:3000/health');
      expect(validateDockerConfig(updated)).toBe(true);
    });

    it('should preserve existing containers', () => {
      const baseConfig = createDefaultDockerConfig('test');
      const withBackend = addContainerToConfig(baseConfig, 'backend', 'api');
      const withFrontend = addContainerToConfig(withBackend, 'frontend', 'web');

      expect(withFrontend.containers.backend).toBeDefined();
      expect(withFrontend.containers.frontend).toBeDefined();
      expect(Object.keys(withFrontend.containers)).toHaveLength(2);
    });
  });

  describe('removeContainerFromConfig', () => {
    it('should remove existing container', () => {
      const config = createDefaultDockerConfig('test');
      const withContainer = addContainerToConfig(config, 'backend', 'api');
      const removed = removeContainerFromConfig(withContainer, 'backend');

      expect(removed.containers.backend).toBeUndefined();
      expect(Object.keys(removed.containers)).toHaveLength(0);
    });

    it('should handle removing non-existent container', () => {
      const config = createDefaultDockerConfig('test');
      const removed = removeContainerFromConfig(config, 'nonexistent');

      expect(removed.containers.nonexistent).toBeUndefined();
      expect(validateDockerConfig(removed)).toBe(true);
    });

    it('should preserve other containers', () => {
      const config = createDefaultDockerConfig('test');
      let updated = addContainerToConfig(config, 'backend', 'api');
      updated = addContainerToConfig(updated, 'frontend', 'web');
      updated = addContainerToConfig(updated, 'database', 'db');

      const removed = removeContainerFromConfig(updated, 'frontend');

      expect(removed.containers.backend).toBeDefined();
      expect(removed.containers.database).toBeDefined();
      expect(removed.containers.frontend).toBeUndefined();
      expect(Object.keys(removed.containers)).toHaveLength(2);
    });
  });

  describe('isDockerEnabled', () => {
    it('should return true for enabled config', () => {
      const config = createDefaultDockerConfig('test');
      expect(isDockerEnabled(config)).toBe(true);
    });

    it('should return false for disabled config', () => {
      const config = { enabled: false } as DockerConfig;
      expect(isDockerEnabled(config)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isDockerEnabled(null)).toBe(false);
      expect(isDockerEnabled(undefined)).toBe(false);
    });
  });

  describe('getContainerConfig', () => {
    it('should return container config when exists', () => {
      const config = createDefaultDockerConfig('test');
      const withContainer = addContainerToConfig(config, 'backend', 'api', 'auto');

      const containerConfig = getContainerConfig(withContainer, 'backend');

      expect(containerConfig).not.toBeNull();
      expect(containerConfig?.service).toBe('api');
      expect(containerConfig?.restart_policy).toBe('auto');
    });

    it('should return null for non-existent container', () => {
      const config = createDefaultDockerConfig('test');
      const containerConfig = getContainerConfig(config, 'nonexistent');

      expect(containerConfig).toBeNull();
    });

    it('should return null for disabled config', () => {
      const config = { enabled: false } as DockerConfig;
      const containerConfig = getContainerConfig(config, 'backend');

      expect(containerConfig).toBeNull();
    });

    it('should return null for null/undefined config', () => {
      expect(getContainerConfig(null, 'backend')).toBeNull();
      expect(getContainerConfig(undefined, 'backend')).toBeNull();
    });
  });

  describe('getContainerNames', () => {
    it('should return all container names', () => {
      let config = createDefaultDockerConfig('test');
      config = addContainerToConfig(config, 'backend', 'api');
      config = addContainerToConfig(config, 'frontend', 'web');
      config = addContainerToConfig(config, 'database', 'db');

      const names = getContainerNames(config);

      expect(names).toHaveLength(3);
      expect(names).toContain('backend');
      expect(names).toContain('frontend');
      expect(names).toContain('database');
    });

    it('should return empty array for config without containers', () => {
      const config = createDefaultDockerConfig('test');
      const names = getContainerNames(config);

      expect(names).toEqual([]);
    });

    it('should return empty array for disabled config', () => {
      const config = { enabled: false } as DockerConfig;
      const names = getContainerNames(config);

      expect(names).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(getContainerNames(null)).toEqual([]);
      expect(getContainerNames(undefined)).toEqual([]);
    });
  });

  describe('isAutoDeployEnabled', () => {
    it('should return true when auto_deploy is true', () => {
      const config = createDefaultDockerConfig('test');
      config.deploy = { auto_deploy: true, deploy_on_merge: false };

      expect(isAutoDeployEnabled(config)).toBe(true);
    });

    it('should return false when auto_deploy is false', () => {
      const config = createDefaultDockerConfig('test');
      config.deploy = { auto_deploy: false, deploy_on_merge: false };

      expect(isAutoDeployEnabled(config)).toBe(false);
    });

    it('should return false when deploy config missing', () => {
      const config = createDefaultDockerConfig('test');
      delete config.deploy;

      expect(isAutoDeployEnabled(config)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isAutoDeployEnabled(null)).toBe(false);
      expect(isAutoDeployEnabled(undefined)).toBe(false);
    });
  });

  describe('isDeployOnMergeEnabled', () => {
    it('should return true when deploy_on_merge is true', () => {
      const config = createDefaultDockerConfig('test');
      config.deploy = { auto_deploy: false, deploy_on_merge: true };

      expect(isDeployOnMergeEnabled(config)).toBe(true);
    });

    it('should return false when deploy_on_merge is false', () => {
      const config = createDefaultDockerConfig('test');
      config.deploy = { auto_deploy: false, deploy_on_merge: false };

      expect(isDeployOnMergeEnabled(config)).toBe(false);
    });

    it('should return false when deploy config missing', () => {
      const config = createDefaultDockerConfig('test');
      delete config.deploy;

      expect(isDeployOnMergeEnabled(config)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isDeployOnMergeEnabled(null)).toBe(false);
      expect(isDeployOnMergeEnabled(undefined)).toBe(false);
    });
  });

  describe('serializeDockerConfig', () => {
    it('should serialize config for database storage', () => {
      const config = createDefaultDockerConfig('test');
      const serialized = serializeDockerConfig(config);

      expect(typeof serialized).toBe('object');
      expect(serialized.enabled).toBe(true);
      expect(serialized.compose_project).toBe('test');
    });

    it('should handle complex config', () => {
      let config = createDefaultDockerConfig('test');
      config = addContainerToConfig(config, 'backend', 'api', 'auto', 'http://localhost:3000');
      config.deploy = {
        auto_deploy: true,
        deploy_on_merge: true,
        build_command: 'npm run build',
      };

      const serialized = serializeDockerConfig(config);

      expect(serialized.containers).toBeDefined();
      expect(serialized.deploy).toBeDefined();
    });
  });

  describe('deserializeDockerConfig', () => {
    it('should deserialize valid config from database', () => {
      const dbData = {
        enabled: true,
        compose_project: 'test',
        compose_file: 'docker-compose.yml',
        containers: {
          backend: {
            service: 'api',
            restart_policy: 'auto',
          },
        },
        deploy: {
          auto_deploy: false,
          deploy_on_merge: false,
        },
      };

      const config = deserializeDockerConfig(dbData);

      expect(config).not.toBeNull();
      expect(config?.enabled).toBe(true);
      expect(config?.compose_project).toBe('test');
      expect(config?.containers.backend).toBeDefined();
    });

    it('should return null for invalid data', () => {
      const invalidData = {
        enabled: true,
        // Missing required fields
      };

      const config = deserializeDockerConfig(invalidData);

      expect(config).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(deserializeDockerConfig(null)).toBeNull();
      expect(deserializeDockerConfig(undefined)).toBeNull();
    });
  });
});
