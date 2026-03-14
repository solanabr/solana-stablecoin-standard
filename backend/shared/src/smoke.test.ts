import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('shared env', () => {
  it('provides defaults', () => {
    const env = loadEnv({});
    expect(env.PORT).toBeGreaterThan(0);
  });
});
