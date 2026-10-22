const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // BUG-034: carga .env.test y aborta si apunta a producción, antes de lib/db.
  setupFiles: ['<rootDir>/jest.env-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  // docs/specs/*.spec.ts son schemas Zod (documentos de especificación), no tests.
  testPathIgnorePatterns: ['/node_modules/', '/docs/specs/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
