/**
 * Unit tests for knowledge-evaluator
 */
import {
  isWorthIndexing,
  isWorthIndexingByName,
  getBlocklist,
  getLowValueList,
} from './knowledge-evaluator';
import { DetectedDependency } from './dependency-detector';

describe('knowledge-evaluator', () => {
  describe('isWorthIndexing', () => {
    it('should approve popular stable frameworks', () => {
      const react: DetectedDependency = {
        name: 'React',
        docsUrl: 'https://react.dev',
        category: 'framework',
        keywords: ['react'],
      };
      expect(isWorthIndexing(react)).toBe(true);
    });

    it('should approve popular services', () => {
      const supabase: DetectedDependency = {
        name: 'Supabase',
        docsUrl: 'https://supabase.com/docs',
        category: 'service',
        keywords: ['supabase'],
      };
      expect(isWorthIndexing(supabase)).toBe(true);
    });

    it('should approve databases', () => {
      const postgres: DetectedDependency = {
        name: 'PostgreSQL',
        docsUrl: 'https://www.postgresql.org/docs',
        category: 'database',
        keywords: ['postgres', 'postgresql'],
      };
      expect(isWorthIndexing(postgres)).toBe(true);
    });

    it('should approve platforms', () => {
      const vercel: DetectedDependency = {
        name: 'Vercel',
        docsUrl: 'https://vercel.com/docs',
        category: 'platform',
        keywords: ['vercel'],
      };
      expect(isWorthIndexing(vercel)).toBe(true);
    });

    it('should approve libraries', () => {
      const prisma: DetectedDependency = {
        name: 'Prisma',
        docsUrl: 'https://www.prisma.io/docs',
        category: 'library',
        keywords: ['prisma'],
      };
      expect(isWorthIndexing(prisma)).toBe(true);
    });

    it('should reject dependencies without docs URL', () => {
      const noDocs: DetectedDependency = {
        name: 'SomeLib',
        docsUrl: '',
        category: 'library',
        keywords: ['somelib'],
      };
      expect(isWorthIndexing(noDocs)).toBe(false);
    });

    it('should reject deprecated AngularJS', () => {
      const angularjs: DetectedDependency = {
        name: 'AngularJS',
        docsUrl: 'https://angularjs.org',
        category: 'framework',
        keywords: ['angularjs'],
      };
      expect(isWorthIndexing(angularjs)).toBe(false);
    });

    it('should reject low-value libraries like lodash', () => {
      const lodash: DetectedDependency = {
        name: 'Lodash',
        docsUrl: 'https://lodash.com',
        category: 'library',
        keywords: ['lodash'],
      };
      expect(isWorthIndexing(lodash)).toBe(false);
    });

    it('should reject jQuery as low-value', () => {
      const jquery: DetectedDependency = {
        name: 'jQuery',
        docsUrl: 'https://jquery.com',
        category: 'library',
        keywords: ['jquery'],
      };
      expect(isWorthIndexing(jquery)).toBe(false);
    });

    it('should reject deprecated Moment.js', () => {
      const moment: DetectedDependency = {
        name: 'Moment',
        docsUrl: 'https://momentjs.com',
        category: 'library',
        keywords: ['moment'],
      };
      expect(isWorthIndexing(moment)).toBe(false);
    });

    it('should reject internal/proprietary tools', () => {
      const internal: DetectedDependency = {
        name: 'Internal Auth Lib',
        docsUrl: 'https://internal.company.com/docs',
        category: 'library',
        keywords: ['internal-auth-lib'],
      };
      expect(isWorthIndexing(internal)).toBe(false);
    });

    it('should reject invalid category', () => {
      const invalidCategory: DetectedDependency = {
        name: 'SomeLib',
        docsUrl: 'https://example.com',
        // @ts-expect-error Testing invalid category
        category: 'invalid',
        keywords: ['somelib'],
      };
      expect(isWorthIndexing(invalidCategory)).toBe(false);
    });

    it('should be case-insensitive for blocklist check', () => {
      const angularJSUpper: DetectedDependency = {
        name: 'AngularJS',
        docsUrl: 'https://angularjs.org',
        category: 'framework',
        keywords: ['ANGULARJS'], // Uppercase
      };
      expect(isWorthIndexing(angularJSUpper)).toBe(false);
    });

    it('should handle dependencies with multiple keywords', () => {
      const nextjs: DetectedDependency = {
        name: 'Next.js',
        docsUrl: 'https://nextjs.org/docs',
        category: 'framework',
        keywords: ['next', 'nextjs', 'next.js'],
      };
      expect(isWorthIndexing(nextjs)).toBe(true);
    });
  });

  describe('isWorthIndexingByName', () => {
    it('should approve valid framework names', () => {
      expect(isWorthIndexingByName('react')).toBe(true);
      expect(isWorthIndexingByName('vue')).toBe(true);
      expect(isWorthIndexingByName('svelte')).toBe(true);
    });

    it('should approve valid service names', () => {
      expect(isWorthIndexingByName('supabase')).toBe(true);
      expect(isWorthIndexingByName('stripe')).toBe(true);
      expect(isWorthIndexingByName('firebase')).toBe(true);
    });

    it('should reject blocklisted names', () => {
      expect(isWorthIndexingByName('angularjs')).toBe(false);
      expect(isWorthIndexingByName('backbone')).toBe(false);
      expect(isWorthIndexingByName('internal-auth-lib')).toBe(false);
    });

    it('should reject low-value names', () => {
      expect(isWorthIndexingByName('lodash')).toBe(false);
      expect(isWorthIndexingByName('moment')).toBe(false);
      expect(isWorthIndexingByName('jquery')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isWorthIndexingByName('REACT')).toBe(true);
      expect(isWorthIndexingByName('React')).toBe(true);
      expect(isWorthIndexingByName('react')).toBe(true);

      expect(isWorthIndexingByName('ANGULARJS')).toBe(false);
      expect(isWorthIndexingByName('AngularJS')).toBe(false);
      expect(isWorthIndexingByName('angularjs')).toBe(false);
    });

    it('should handle partial matches in blocklist', () => {
      // "angularjs" is blocklisted, so anything containing it should be rejected
      expect(isWorthIndexingByName('angularjs-plugin')).toBe(false);
    });

    it('should handle unknown dependencies (approve by default)', () => {
      expect(isWorthIndexingByName('unknown-framework')).toBe(true);
      expect(isWorthIndexingByName('new-library-2024')).toBe(true);
    });
  });

  describe('getBlocklist', () => {
    it('should return blocklist array', () => {
      const blocklist = getBlocklist();
      expect(Array.isArray(blocklist)).toBe(true);
      expect(blocklist.length).toBeGreaterThan(0);
    });

    it('should include known deprecated frameworks', () => {
      const blocklist = getBlocklist();
      expect(blocklist).toContain('angularjs');
      expect(blocklist).toContain('backbone');
    });

    it('should return a new array (not mutate internal state)', () => {
      const blocklist1 = getBlocklist();
      const blocklist2 = getBlocklist();

      expect(blocklist1).not.toBe(blocklist2); // Different instances
      expect(blocklist1).toEqual(blocklist2); // Same content
    });
  });

  describe('getLowValueList', () => {
    it('should return low-value list array', () => {
      const lowValue = getLowValueList();
      expect(Array.isArray(lowValue)).toBe(true);
      expect(lowValue.length).toBeGreaterThan(0);
    });

    it('should include known low-value libraries', () => {
      const lowValue = getLowValueList();
      expect(lowValue).toContain('lodash');
      expect(lowValue).toContain('moment');
      expect(lowValue).toContain('jquery');
    });

    it('should return a new array (not mutate internal state)', () => {
      const lowValue1 = getLowValueList();
      const lowValue2 = getLowValueList();

      expect(lowValue1).not.toBe(lowValue2); // Different instances
      expect(lowValue1).toEqual(lowValue2); // Same content
    });
  });

  describe('integration with real dependencies', () => {
    it('should approve modern web frameworks', () => {
      const frameworks = [
        { name: 'React', docsUrl: 'https://react.dev', category: 'framework', keywords: ['react'] },
        { name: 'Vue', docsUrl: 'https://vuejs.org', category: 'framework', keywords: ['vue'] },
        {
          name: 'Next.js',
          docsUrl: 'https://nextjs.org/docs',
          category: 'framework',
          keywords: ['next', 'nextjs'],
        },
      ] as DetectedDependency[];

      frameworks.forEach(fw => {
        expect(isWorthIndexing(fw)).toBe(true);
      });
    });

    it('should approve modern backend frameworks', () => {
      const frameworks = [
        {
          name: 'FastAPI',
          docsUrl: 'https://fastapi.tiangolo.com',
          category: 'framework',
          keywords: ['fastapi'],
        },
        {
          name: 'Express',
          docsUrl: 'https://expressjs.com',
          category: 'framework',
          keywords: ['express'],
        },
        {
          name: 'NestJS',
          docsUrl: 'https://docs.nestjs.com',
          category: 'framework',
          keywords: ['nestjs'],
        },
      ] as DetectedDependency[];

      frameworks.forEach(fw => {
        expect(isWorthIndexing(fw)).toBe(true);
      });
    });

    it('should approve cloud services', () => {
      const services = [
        {
          name: 'Supabase',
          docsUrl: 'https://supabase.com/docs',
          category: 'service',
          keywords: ['supabase'],
        },
        {
          name: 'Stripe',
          docsUrl: 'https://stripe.com/docs',
          category: 'service',
          keywords: ['stripe'],
        },
        {
          name: 'Firebase',
          docsUrl: 'https://firebase.google.com/docs',
          category: 'service',
          keywords: ['firebase'],
        },
      ] as DetectedDependency[];

      services.forEach(svc => {
        expect(isWorthIndexing(svc)).toBe(true);
      });
    });
  });
});
