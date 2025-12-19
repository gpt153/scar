/**
 * Dependency Detector
 *
 * Parses user prompts to detect external dependencies and maps them
 * to their official documentation URLs for Archon indexing.
 */

export interface DetectedDependency {
  name: string; // Display name (e.g., "React")
  docsUrl: string; // Official documentation URL
  category: 'framework' | 'library' | 'service' | 'database' | 'platform';
  keywords: string[]; // Lowercase keywords for detection
}

/**
 * Database of known dependencies with their documentation URLs
 * Organized by category for maintainability
 */
const KNOWN_DEPENDENCIES: DetectedDependency[] = [
  // Frontend Frameworks
  {
    name: 'React',
    docsUrl: 'https://react.dev',
    category: 'framework',
    keywords: ['react', 'reactjs', 'react.js'],
  },
  {
    name: 'Vue',
    docsUrl: 'https://vuejs.org',
    category: 'framework',
    keywords: ['vue', 'vuejs', 'vue.js'],
  },
  {
    name: 'Angular',
    docsUrl: 'https://angular.io',
    category: 'framework',
    keywords: ['angular', 'angularjs'],
  },
  {
    name: 'Svelte',
    docsUrl: 'https://svelte.dev',
    category: 'framework',
    keywords: ['svelte', 'sveltekit'],
  },
  {
    name: 'Next.js',
    docsUrl: 'https://nextjs.org/docs',
    category: 'framework',
    keywords: ['next', 'nextjs', 'next.js'],
  },

  // Backend Frameworks
  {
    name: 'Express',
    docsUrl: 'https://expressjs.com',
    category: 'framework',
    keywords: ['express', 'expressjs', 'express.js'],
  },
  {
    name: 'FastAPI',
    docsUrl: 'https://fastapi.tiangolo.com',
    category: 'framework',
    keywords: ['fastapi', 'fast api'],
  },
  {
    name: 'Django',
    docsUrl: 'https://docs.djangoproject.com',
    category: 'framework',
    keywords: ['django'],
  },
  {
    name: 'Flask',
    docsUrl: 'https://flask.palletsprojects.com',
    category: 'framework',
    keywords: ['flask'],
  },
  {
    name: 'NestJS',
    docsUrl: 'https://docs.nestjs.com',
    category: 'framework',
    keywords: ['nest', 'nestjs', 'nest.js'],
  },

  // Services & Platforms
  {
    name: 'Supabase',
    docsUrl: 'https://supabase.com/docs',
    category: 'service',
    keywords: ['supabase'],
  },
  {
    name: 'Firebase',
    docsUrl: 'https://firebase.google.com/docs',
    category: 'service',
    keywords: ['firebase'],
  },
  {
    name: 'Stripe',
    docsUrl: 'https://stripe.com/docs',
    category: 'service',
    keywords: ['stripe'],
  },
  {
    name: 'Vercel',
    docsUrl: 'https://vercel.com/docs',
    category: 'platform',
    keywords: ['vercel'],
  },
  {
    name: 'AWS',
    docsUrl: 'https://docs.aws.amazon.com',
    category: 'platform',
    keywords: ['aws', 'amazon web services'],
  },

  // Databases
  {
    name: 'PostgreSQL',
    docsUrl: 'https://www.postgresql.org/docs',
    category: 'database',
    keywords: ['postgres', 'postgresql', 'pg'],
  },
  {
    name: 'MongoDB',
    docsUrl: 'https://www.mongodb.com/docs',
    category: 'database',
    keywords: ['mongodb', 'mongo'],
  },
  {
    name: 'Redis',
    docsUrl: 'https://redis.io/docs',
    category: 'database',
    keywords: ['redis'],
  },
  {
    name: 'MySQL',
    docsUrl: 'https://dev.mysql.com/doc',
    category: 'database',
    keywords: ['mysql'],
  },

  // Libraries & Tools
  {
    name: 'Discord.js',
    docsUrl: 'https://discord.js.org',
    category: 'library',
    keywords: ['discord.js', 'discordjs', 'discord bot'],
  },
  {
    name: 'Telegraf',
    docsUrl: 'https://telegraf.js.org',
    category: 'library',
    keywords: ['telegraf', 'telegram bot'],
  },
  {
    name: 'Grammy',
    docsUrl: 'https://grammy.dev',
    category: 'library',
    keywords: ['grammy', 'grammyjs'],
  },
  {
    name: 'Socket.io',
    docsUrl: 'https://socket.io/docs',
    category: 'library',
    keywords: ['socket.io', 'socketio', 'websocket'],
  },
  {
    name: 'Prisma',
    docsUrl: 'https://www.prisma.io/docs',
    category: 'library',
    keywords: ['prisma', 'prisma orm'],
  },
  {
    name: 'TypeORM',
    docsUrl: 'https://typeorm.io',
    category: 'library',
    keywords: ['typeorm', 'type-orm'],
  },
  {
    name: 'Zod',
    docsUrl: 'https://zod.dev',
    category: 'library',
    keywords: ['zod', 'validation'],
  },
  {
    name: 'Tailwind CSS',
    docsUrl: 'https://tailwindcss.com/docs',
    category: 'library',
    keywords: ['tailwind', 'tailwindcss', 'tailwind css'],
  },
  {
    name: 'GraphQL',
    docsUrl: 'https://graphql.org/learn',
    category: 'library',
    keywords: ['graphql', 'graph ql'],
  },
  {
    name: 'Axios',
    docsUrl: 'https://axios-http.com/docs',
    category: 'library',
    keywords: ['axios'],
  },
  {
    name: 'Jest',
    docsUrl: 'https://jestjs.io/docs',
    category: 'library',
    keywords: ['jest', 'jestjs'],
  },
  {
    name: 'Vitest',
    docsUrl: 'https://vitest.dev',
    category: 'library',
    keywords: ['vitest'],
  },
];

/**
 * Detects external dependencies mentioned in user prompt
 *
 * @param prompt - The user's message to analyze
 * @returns Array of detected dependencies with their documentation URLs
 */
export function detectDependencies(prompt: string): DetectedDependency[] {
  const normalizedPrompt = prompt.toLowerCase();
  const detected: DetectedDependency[] = [];
  const detectedNames = new Set<string>();

  for (const dep of KNOWN_DEPENDENCIES) {
    // Check if any keyword matches
    const isMatch = dep.keywords.some(keyword => {
      // Use word boundaries to avoid false positives
      // e.g., "react" should match "use React hooks" but not "create"
      const regex = new RegExp(`\\b${keyword.replace(/\./g, '\\.')}\\b`, 'i');
      return regex.test(normalizedPrompt);
    });

    if (isMatch && !detectedNames.has(dep.name)) {
      detected.push(dep);
      detectedNames.add(dep.name);
    }
  }

  return detected;
}

/**
 * Gets the full list of known dependencies
 * Useful for configuration and debugging
 *
 * @returns Array of all known dependencies
 */
export function getKnownDependencies(): DetectedDependency[] {
  return [...KNOWN_DEPENDENCIES];
}

/**
 * Checks if a specific dependency is known
 *
 * @param name - The dependency name to check (case-insensitive)
 * @returns The dependency if found, undefined otherwise
 */
export function getDependencyByName(name: string): DetectedDependency | undefined {
  const normalizedName = name.toLowerCase();
  return KNOWN_DEPENDENCIES.find(dep => dep.keywords.includes(normalizedName));
}
