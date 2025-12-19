/**
 * Unit tests for dependency-detector
 */
import {
  detectDependencies,
  getKnownDependencies,
  getDependencyByName,
} from './dependency-detector';

describe('dependency-detector', () => {
  describe('detectDependencies', () => {
    it('should detect React mentions', () => {
      const result = detectDependencies('Use React hooks for state management');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('React');
      expect(result[0].docsUrl).toBe('https://react.dev');
      expect(result[0].category).toBe('framework');
    });

    it('should detect Supabase mentions', () => {
      const result = detectDependencies('Implement Supabase real-time subscriptions');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Supabase');
      expect(result[0].docsUrl).toBe('https://supabase.com/docs');
      expect(result[0].category).toBe('service');
    });

    it('should detect multiple dependencies in one message', () => {
      const result = detectDependencies('Build a Next.js app with Supabase and Stripe payments');
      expect(result).toHaveLength(3);
      const names = result.map(d => d.name).sort();
      expect(names).toEqual(['Next.js', 'Stripe', 'Supabase']);
    });

    it('should be case-insensitive', () => {
      const result1 = detectDependencies('REACT hooks');
      const result2 = detectDependencies('react hooks');
      const result3 = detectDependencies('React hooks');

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result3).toHaveLength(1);
      expect(result1[0].name).toBe(result2[0].name);
      expect(result2[0].name).toBe(result3[0].name);
    });

    it('should detect PostgreSQL with various keywords', () => {
      const postgres = detectDependencies('Connect to PostgreSQL database');
      const pg = detectDependencies('Use pg client for queries');
      const postgres2 = detectDependencies('Setup Postgres connection');

      expect(postgres).toHaveLength(1);
      expect(pg).toHaveLength(1);
      expect(postgres2).toHaveLength(1);
      expect(postgres[0].name).toBe('PostgreSQL');
      expect(pg[0].name).toBe('PostgreSQL');
      expect(postgres2[0].name).toBe('PostgreSQL');
    });

    it('should use word boundaries to avoid false positives', () => {
      // "create" should not match "React"
      const result = detectDependencies('create a new function');
      const reactMatch = result.find(d => d.name === 'React');
      expect(reactMatch).toBeUndefined();
    });

    it('should return empty array when no dependencies detected', () => {
      const result = detectDependencies('This is just a simple message with no framework mentions');
      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('should not duplicate dependencies if mentioned multiple times', () => {
      const result = detectDependencies('Use React hooks and React components with React state');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('React');
    });

    it('should detect Discord.js for Discord bot mentions', () => {
      const result = detectDependencies('Build a Discord bot with discord.js');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Discord.js');
      expect(result[0].docsUrl).toBe('https://discord.js.org');
    });

    it('should detect FastAPI', () => {
      const result = detectDependencies('Create a FastAPI endpoint');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('FastAPI');
      expect(result[0].category).toBe('framework');
    });

    it('should detect Stripe payments', () => {
      const result = detectDependencies('Add Stripe payment integration');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Stripe');
      expect(result[0].category).toBe('service');
    });

    it('should detect MongoDB', () => {
      const result = detectDependencies('Store data in MongoDB');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('MongoDB');
      expect(result[0].category).toBe('database');
    });

    it('should detect Next.js with various formats', () => {
      const next = detectDependencies('Build with Next.js');
      const nextjs = detectDependencies('Build with nextjs');

      expect(next).toHaveLength(1);
      expect(nextjs).toHaveLength(1);
      expect(next[0].name).toBe('Next.js');
      expect(nextjs[0].name).toBe('Next.js');
    });

    it('should detect Express framework', () => {
      const result = detectDependencies('Create Express REST API');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Express');
      expect(result[0].category).toBe('framework');
    });

    it('should detect Socket.io for WebSocket mentions', () => {
      const socketio = detectDependencies('Implement Socket.io real-time features');
      const websocket = detectDependencies('Add WebSocket support');

      expect(socketio).toHaveLength(1);
      expect(websocket).toHaveLength(1);
      expect(socketio[0].name).toBe('Socket.io');
      expect(websocket[0].name).toBe('Socket.io');
    });

    it('should handle complex real-world prompts', () => {
      const prompt = `
        I want to build a full-stack application using Next.js for the frontend,
        FastAPI for the backend, PostgreSQL for the database, and Stripe for payments.
        We'll also need Redis for caching and Socket.io for real-time features.
      `;

      const result = detectDependencies(prompt);
      expect(result.length).toBeGreaterThanOrEqual(6);

      const names = result.map(d => d.name);
      expect(names).toContain('Next.js');
      expect(names).toContain('FastAPI');
      expect(names).toContain('PostgreSQL');
      expect(names).toContain('Stripe');
      expect(names).toContain('Redis');
      expect(names).toContain('Socket.io');
    });

    it('should detect testing frameworks', () => {
      const jest = detectDependencies('Write tests with Jest');
      const vitest = detectDependencies('Use Vitest for testing');

      expect(jest).toHaveLength(1);
      expect(vitest).toHaveLength(1);
      expect(jest[0].name).toBe('Jest');
      expect(vitest[0].name).toBe('Vitest');
    });
  });

  describe('getKnownDependencies', () => {
    it('should return all known dependencies', () => {
      const result = getKnownDependencies();
      expect(result.length).toBeGreaterThan(20);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return a new array (not mutate internal state)', () => {
      const result1 = getKnownDependencies();
      const result2 = getKnownDependencies();

      expect(result1).not.toBe(result2); // Different array instances
      expect(result1).toEqual(result2); // Same content
    });

    it('should include expected categories', () => {
      const result = getKnownDependencies();
      const categories = new Set(result.map(d => d.category));

      expect(categories.has('framework')).toBe(true);
      expect(categories.has('library')).toBe(true);
      expect(categories.has('service')).toBe(true);
      expect(categories.has('database')).toBe(true);
      expect(categories.has('platform')).toBe(true);
    });
  });

  describe('getDependencyByName', () => {
    it('should find dependency by exact keyword', () => {
      const react = getDependencyByName('react');
      expect(react).toBeDefined();
      expect(react?.name).toBe('React');
    });

    it('should be case-insensitive', () => {
      const react1 = getDependencyByName('REACT');
      const react2 = getDependencyByName('react');
      const react3 = getDependencyByName('React');

      expect(react1).toBeDefined();
      expect(react2).toBeDefined();
      expect(react3).toBeDefined();
      expect(react1?.name).toBe(react2?.name);
      expect(react2?.name).toBe(react3?.name);
    });

    it('should find dependency by any of its keywords', () => {
      const postgres1 = getDependencyByName('postgres');
      const postgres2 = getDependencyByName('postgresql');
      const postgres3 = getDependencyByName('pg');

      expect(postgres1).toBeDefined();
      expect(postgres2).toBeDefined();
      expect(postgres3).toBeDefined();
      expect(postgres1?.name).toBe('PostgreSQL');
      expect(postgres2?.name).toBe('PostgreSQL');
      expect(postgres3?.name).toBe('PostgreSQL');
    });

    it('should return undefined for unknown dependencies', () => {
      const result = getDependencyByName('unknown-framework');
      expect(result).toBeUndefined();
    });

    it('should find Next.js with various formats', () => {
      const next = getDependencyByName('next');
      const nextjs = getDependencyByName('nextjs');

      expect(next).toBeDefined();
      expect(nextjs).toBeDefined();
      expect(next?.name).toBe('Next.js');
      expect(nextjs?.name).toBe('Next.js');
    });
  });

  describe('DetectedDependency interface', () => {
    it('should have correct structure', () => {
      const deps = getKnownDependencies();
      const react = deps.find(d => d.name === 'React');

      expect(react).toBeDefined();
      expect(typeof react?.name).toBe('string');
      expect(typeof react?.docsUrl).toBe('string');
      expect(typeof react?.category).toBe('string');
      expect(Array.isArray(react?.keywords)).toBe(true);
    });

    it('should have valid URLs', () => {
      const deps = getKnownDependencies();
      for (const dep of deps) {
        expect(dep.docsUrl).toMatch(/^https:\/\//);
        expect(() => new URL(dep.docsUrl)).not.toThrow();
      }
    });

    it('should have lowercase keywords', () => {
      const deps = getKnownDependencies();
      for (const dep of deps) {
        for (const keyword of dep.keywords) {
          expect(keyword).toBe(keyword.toLowerCase());
        }
      }
    });
  });
});
