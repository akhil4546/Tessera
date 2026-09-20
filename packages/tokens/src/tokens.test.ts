import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { darkSemantic, lightSemantic, requiredSemanticKeys } from './semantic';

const AA_NORMAL_TEXT = 4.5;

describe('semantic tokens', () => {
  it('defines every required semantic key in light and dark', () => {
    for (const key of requiredSemanticKeys) {
      expect(lightSemantic[key]).toBeTruthy();
      expect(darkSemantic[key]).toBeTruthy();
    }
  });

  it('meets WCAG 2.2 AA contrast for primary text on surface (light)', () => {
    expect(contrastRatio(lightSemantic.textPrimary, lightSemantic.surface)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('meets WCAG 2.2 AA contrast for primary text on surface (dark)', () => {
    expect(contrastRatio(darkSemantic.textPrimary, darkSemantic.surface)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('meets AA contrast for inverse text on accent (light)', () => {
    expect(contrastRatio(lightSemantic.textInverse, lightSemantic.accent)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('meets AA contrast for inverse text on accent (dark)', () => {
    expect(contrastRatio(darkSemantic.textInverse, darkSemantic.accent)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });
});
