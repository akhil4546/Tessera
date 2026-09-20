import { describe, expect, it } from 'vitest';
import {
  FixtureMediaClassifier,
  StubMediaClassifier,
  classificationHolds,
  resolveClassifier,
} from './classifier.ts';

describe('media classifier', () => {
  it('stub always returns unknown and is labelled', async () => {
    const stub = new StubMediaClassifier();
    const result = await stub.classify({
      mediaId: 'm1',
      kind: 'image',
      mimeType: 'image/jpeg',
      byteSize: 12,
    });
    expect(result.labelledStub).toBe(true);
    expect(result.provider).toBe('stub');
    expect(result.nudity).toBe('unknown');
    expect(result.violence).toBe('unknown');
    expect(classificationHolds(result)).toBe(false);
  });

  it('unknown CLASSIFIER_PROVIDER falls back to stub, not a fake live model', () => {
    const classifier = resolveClassifier({ CLASSIFIER_PROVIDER: 'imaginary-vendor' });
    expect(classifier.provider).toBe('stub');
  });

  it('fixture can hold without pretending to be the stub', async () => {
    const fixture = new FixtureMediaClassifier({
      nudity: 'likely',
      violence: 'unknown',
      note: 'test fixture',
    });
    const result = await fixture.classify({
      mediaId: 'm2',
      kind: 'image',
      mimeType: 'image/jpeg',
      byteSize: 1,
    });
    expect(classificationHolds(result)).toBe(true);
  });
});
