/**
 * Unit tests for archon-auto-research
 */
import {
  getCrawlStrategy,
  generateArchonInstructions,
  analyzeAndPrepareArchonInstructions,
  isArchonMcpEnabled,
} from './archon-auto-research';
import { DetectedDependency } from '../utils/dependency-detector';

// Store original env
const originalEnv = { ...process.env };

describe('archon-auto-research', () => {
  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.ARCHON_AUTO_CRAWL;
    delete process.env.ARCHON_CRAWL_STRATEGY;
    delete process.env.ARCHON_CRAWL_MAX_WAIT;
    delete process.env.ENABLE_ARCHON_MCP;
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('getCrawlStrategy', () => {
    it('should return disabled when ARCHON_AUTO_CRAWL is not set', () => {
      const strategy = getCrawlStrategy();
      expect(strategy.mode).toBe('disabled');
      expect(strategy.maxWaitMs).toBe(0);
    });

    it('should return disabled when ARCHON_AUTO_CRAWL is false', () => {
      process.env.ARCHON_AUTO_CRAWL = 'false';
      const strategy = getCrawlStrategy();
      expect(strategy.mode).toBe('disabled');
    });

    it('should return background mode by default when enabled', () => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      const strategy = getCrawlStrategy();
      expect(strategy.mode).toBe('background');
      expect(strategy.maxWaitMs).toBe(60000);
    });

    it('should respect ARCHON_CRAWL_STRATEGY setting', () => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      process.env.ARCHON_CRAWL_STRATEGY = 'blocking';
      const strategy = getCrawlStrategy();
      expect(strategy.mode).toBe('blocking');
    });

    it('should respect ARCHON_CRAWL_MAX_WAIT setting', () => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      process.env.ARCHON_CRAWL_MAX_WAIT = '30000';
      const strategy = getCrawlStrategy();
      expect(strategy.maxWaitMs).toBe(30000);
    });

    it('should support suggest mode', () => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      process.env.ARCHON_CRAWL_STRATEGY = 'suggest';
      const strategy = getCrawlStrategy();
      expect(strategy.mode).toBe('suggest');
    });
  });

  describe('generateArchonInstructions', () => {
    const react: DetectedDependency = {
      name: 'React',
      docsUrl: 'https://react.dev',
      category: 'framework',
      keywords: ['react'],
    };

    const supabase: DetectedDependency = {
      name: 'Supabase',
      docsUrl: 'https://supabase.com/docs',
      category: 'service',
      keywords: ['supabase'],
    };

    it('should return empty string for disabled strategy', () => {
      const instructions = generateArchonInstructions([react], {
        mode: 'disabled',
        maxWaitMs: 0,
      });
      expect(instructions).toBe('');
    });

    it('should return empty string for empty dependencies', () => {
      const instructions = generateArchonInstructions([], {
        mode: 'background',
        maxWaitMs: 60000,
      });
      expect(instructions).toBe('');
    });

    it('should generate background mode instructions', () => {
      const instructions = generateArchonInstructions([react], {
        mode: 'background',
        maxWaitMs: 60000,
      });

      expect(instructions).toContain('Archon Auto-Research Detected');
      expect(instructions).toContain('React (https://react.dev)');
      expect(instructions).toContain('BACKGROUND');
      expect(instructions).toContain('DO NOT block');
      expect(instructions).toContain('mcp__archon__rag_get_available_sources');
    });

    it('should generate blocking mode instructions', () => {
      const instructions = generateArchonInstructions([supabase], {
        mode: 'blocking',
        maxWaitMs: 30000,
      });

      expect(instructions).toContain('Archon Auto-Research Detected');
      expect(instructions).toContain('Supabase (https://supabase.com/docs)');
      expect(instructions).toContain('BLOCKING');
      expect(instructions).toContain('max 30000ms');
      expect(instructions).toContain('Wait for crawl completion');
    });

    it('should generate suggest mode instructions', () => {
      const instructions = generateArchonInstructions([react], {
        mode: 'suggest',
        maxWaitMs: 60000,
      });

      expect(instructions).toContain('Archon Auto-Research Detected');
      expect(instructions).toContain('SUGGEST');
      expect(instructions).toContain('Wait for user confirmation');
      expect(instructions).toContain('Only crawl if user approves');
    });

    it('should list multiple dependencies', () => {
      const instructions = generateArchonInstructions([react, supabase], {
        mode: 'background',
        maxWaitMs: 60000,
      });

      expect(instructions).toContain('React (https://react.dev)');
      expect(instructions).toContain('Supabase (https://supabase.com/docs)');
    });

    it('should include MCP tool instructions', () => {
      const instructions = generateArchonInstructions([react], {
        mode: 'blocking',
        maxWaitMs: 60000,
      });

      expect(instructions).toContain('mcp__archon__rag_get_available_sources()');
      expect(instructions).toContain('check Archon knowledge base');
    });
  });

  describe('analyzeAndPrepareArchonInstructions', () => {
    beforeEach(() => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      process.env.ARCHON_CRAWL_STRATEGY = 'background';
    });

    it('should detect React and generate instructions', () => {
      const instructions = analyzeAndPrepareArchonInstructions('Use React hooks for state');
      expect(instructions).toContain('React');
      expect(instructions).toContain('Archon Auto-Research');
    });

    it('should detect Supabase and generate instructions', () => {
      const instructions = analyzeAndPrepareArchonInstructions(
        'Implement Supabase authentication'
      );
      expect(instructions).toContain('Supabase');
      expect(instructions).toContain('Archon Auto-Research');
    });

    it('should detect multiple dependencies', () => {
      const instructions = analyzeAndPrepareArchonInstructions(
        'Build a Next.js app with Supabase and Stripe'
      );
      expect(instructions).toContain('Next.js');
      expect(instructions).toContain('Supabase');
      expect(instructions).toContain('Stripe');
    });

    it('should return empty for no dependencies', () => {
      const instructions = analyzeAndPrepareArchonInstructions('This has no framework mentions');
      expect(instructions).toBe('');
    });

    it('should return empty when auto-crawl is disabled', () => {
      process.env.ARCHON_AUTO_CRAWL = 'false';
      const instructions = analyzeAndPrepareArchonInstructions('Use React hooks');
      expect(instructions).toBe('');
    });

    it('should filter out low-value dependencies', () => {
      const instructions = analyzeAndPrepareArchonInstructions('Use lodash for utilities');
      expect(instructions).toBe(''); // lodash is low-value, should be filtered
    });

    it('should filter out deprecated dependencies', () => {
      const instructions = analyzeAndPrepareArchonInstructions('Use AngularJS for the app');
      expect(instructions).toBe(''); // AngularJS is deprecated, should be filtered
    });

    it('should work with complex real-world prompts', () => {
      const prompt = `
        Build a full-stack app with Next.js frontend, FastAPI backend,
        PostgreSQL database, and integrate Stripe payments.
      `;
      const instructions = analyzeAndPrepareArchonInstructions(prompt);

      expect(instructions).toContain('Next.js');
      expect(instructions).toContain('FastAPI');
      expect(instructions).toContain('PostgreSQL');
      expect(instructions).toContain('Stripe');
    });

    it('should respect different crawl strategies', () => {
      process.env.ARCHON_CRAWL_STRATEGY = 'blocking';
      const blocking = analyzeAndPrepareArchonInstructions('Use React');
      expect(blocking).toContain('BLOCKING');

      process.env.ARCHON_CRAWL_STRATEGY = 'suggest';
      const suggest = analyzeAndPrepareArchonInstructions('Use React');
      expect(suggest).toContain('SUGGEST');
    });
  });

  describe('isArchonMcpEnabled', () => {
    it('should return false when ENABLE_ARCHON_MCP is not set', () => {
      expect(isArchonMcpEnabled()).toBe(false);
    });

    it('should return false when ENABLE_ARCHON_MCP is false', () => {
      process.env.ENABLE_ARCHON_MCP = 'false';
      expect(isArchonMcpEnabled()).toBe(false);
    });

    it('should return true when ENABLE_ARCHON_MCP is true', () => {
      process.env.ENABLE_ARCHON_MCP = 'true';
      expect(isArchonMcpEnabled()).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      process.env.ARCHON_AUTO_CRAWL = 'true';
      process.env.ENABLE_ARCHON_MCP = 'true';
    });

    it('should handle first-time dependency mention (background mode)', () => {
      process.env.ARCHON_CRAWL_STRATEGY = 'background';
      const instructions = analyzeAndPrepareArchonInstructions(
        'How do I use Supabase real-time?'
      );

      expect(instructions).toContain('Supabase');
      expect(instructions).toContain('BACKGROUND');
      expect(instructions).toContain('DO NOT block');
    });

    it('should handle first-time dependency mention (blocking mode)', () => {
      process.env.ARCHON_CRAWL_STRATEGY = 'blocking';
      process.env.ARCHON_CRAWL_MAX_WAIT = '45000';
      const instructions = analyzeAndPrepareArchonInstructions('Add Stripe payments');

      expect(instructions).toContain('Stripe');
      expect(instructions).toContain('BLOCKING');
      expect(instructions).toContain('max 45000ms');
    });

    it('should handle planning workflow', () => {
      const prompt = 'Plan implementation of Discord bot with discord.js';
      const instructions = analyzeAndPrepareArchonInstructions(prompt);

      expect(instructions).toContain('Discord.js');
      expect(instructions).toContain('mcp__archon__rag_get_available_sources');
    });

    it('should not interfere with non-dependency prompts', () => {
      const prompts = [
        'What files handle routing?',
        'Explain how the authentication works',
        'Fix the bug in line 42',
        'Write a unit test for the parser',
      ];

      for (const prompt of prompts) {
        const instructions = analyzeAndPrepareArchonInstructions(prompt);
        expect(instructions).toBe('');
      }
    });
  });
});
