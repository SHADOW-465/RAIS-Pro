import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  // Shared fixtures live under __tests__/fixtures and are not test files.
  // .claude/worktrees/ holds nested git worktrees (each a full checkout) --
  // without this, jest discovers and re-runs their tests too, multiplying
  // counts and duplicating any pre-existing failures once per worktree.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/', '/.claude/worktrees/'],
  // Set MOID_STORE=memory before any module loads so tests never hit a live Supabase project.
  setupFiles: ['<rootDir>/jest.setup.ts'],
};

export default createJestConfig(config);
