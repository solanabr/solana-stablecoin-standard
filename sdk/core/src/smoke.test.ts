import { describe, expect, it } from 'vitest';
import { PRESET_DEFINITIONS, Presets } from './presets.js';

describe('preset definitions', () => {
  it('enables compliance for SSS-2 only', () => {
    expect(PRESET_DEFINITIONS[Presets.SSS_1].enableCompliance).toBe(false);
    expect(PRESET_DEFINITIONS[Presets.SSS_2].enableCompliance).toBe(true);
  });
});
