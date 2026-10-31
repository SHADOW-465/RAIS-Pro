import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  // Shared fixtures live under __tests__/fixtures and are not test files.
  // .claude/worktrees/ holds nested git worktrees (each a full checkout) --
  // without this, jest discovers and re-runs their tests too, multiplying
  // counts and duplicating any pre-existing failures once per worktree.
  // Anchored to <rootDir> (not a bare substring) so this only excludes
  // worktrees NESTED under wherever jest is actually run from -- a worktree
  // run from inside itself still finds its own tests, since its own path
  // isn't "<its rootDir>/.claude/worktrees/...".
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/', '<rootDir>/.claude/worktrees/'],
  // next/jest's SWC transform rewrites "@/..." for static import/export syntax
  // (matching tsconfig's paths), but a handful of files use a dynamic
  // require("@/...") to defer a heavy/circular import — that's a literal
  // runtime string, never touched by the transform, so it needs an explicit
  // resolver mapping or it 404s under Jest even though it works in Next itself.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Set MOID_STORE=memory before any module loads so tests never hit a live Supabase project.
  setupFiles: ['<rootDir>/jest.setup.ts'],
};

export default createJestConfig(config);
