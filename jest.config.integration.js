const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
  },
  testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  // Integration tests hit a real Supabase + Microsoft Graph; running them in
  // parallel would mix audit-log rows from concurrent tests and slow Graph
  // throttle responses. Serial is what we want.
  maxWorkers: 1,
  testTimeout: 30_000,
  // No coverage gates — these aren't unit tests.
  collectCoverage: false,
}

module.exports = createJestConfig(customJestConfig)
