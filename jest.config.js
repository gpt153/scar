module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts', '!src/test/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
  verbose: true,
  transformIgnorePatterns: ['node_modules/(?!(@octokit|@anthropic-ai)/)'],
  moduleNameMapper: {
    '^@octokit/rest$': '<rootDir>/src/test/__mocks__/@octokit/rest.ts',
  },
};
