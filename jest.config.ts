import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  // Shared fixtures live under __tests__/fixtures and are not test files.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/'],
  // Set MOID_STORE=memory before any module loads so tests never hit a live Supabase project.
  setupFiles: ['<rootDir>/jest.setup.ts'],
};

export default createJestConfig(config);
