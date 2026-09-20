/**
 * Pluggable media classifier for nudity and violence.
 *
 * Local/dev uses StubMediaClassifier. It is labelled and always returns
 * `unknown` — it does not pretend the content is safe or unsafe.
 *
 * A real provider implements MediaClassifier and is selected with
 * CLASSIFIER_PROVIDER. Unknown providers fall back to the stub.
 */
import type { ClassificationLabel } from '@tessera/types';

export type ClassifierKind = 'image' | 'video';

export type ClassificationInput = {
  mediaId: string;
  kind: ClassifierKind;
  mimeType: string;
  byteSize: number;
};

export type ClassificationResult = {
  provider: string;
  labelledStub: boolean;
  nudity: ClassificationLabel;
  violence: ClassificationLabel;
  note: string;
};

export interface MediaClassifier {
  readonly provider: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

export const STUB_CLASSIFIER_NOTE =
  'STUB: CLASSIFIER_PROVIDER is unset or stub. No real nudity/violence scores were produced.';

export class StubMediaClassifier implements MediaClassifier {
  readonly provider = 'stub';

  async classify(_input: ClassificationInput): Promise<ClassificationResult> {
    return {
      provider: this.provider,
      labelledStub: true,
      nudity: 'unknown',
      violence: 'unknown',
      note: STUB_CLASSIFIER_NOTE,
    };
  }
}

/**
 * Test-only classifier that returns a configured verdict.
 * Never selected from CLASSIFIER_PROVIDER in local/dev.
 */
export class FixtureMediaClassifier implements MediaClassifier {
  readonly provider = 'fixture';

  constructor(private readonly result: Omit<ClassificationResult, 'provider' | 'labelledStub'>) {}

  async classify(_input: ClassificationInput): Promise<ClassificationResult> {
    return {
      provider: this.provider,
      labelledStub: true,
      ...this.result,
    };
  }
}

export function resolveClassifier(env: NodeJS.ProcessEnv = process.env): MediaClassifier {
  const name = (env.CLASSIFIER_PROVIDER ?? 'stub').trim().toLowerCase();
  if (name === '' || name === 'stub') {
    return new StubMediaClassifier();
  }
  // Unwired providers must not fake a live model.
  return new StubMediaClassifier();
}

export function classificationHolds(result: ClassificationResult): boolean {
  return result.nudity === 'likely' || result.violence === 'likely';
}

export function classificationMarksSensitive(result: ClassificationResult): boolean {
  return classificationHolds(result);
}
