import type { TesseraPrisma } from '@tessera/db';
import {
  classificationHolds,
  classificationMarksSensitive,
  resolveClassifier,
  type ClassificationResult,
  type MediaClassifier,
} from './classifier.ts';
import type { MediaLogger } from './logger.ts';

export async function classifyAndStore(
  prisma: TesseraPrisma,
  mediaId: string,
  log: MediaLogger,
  classifier: MediaClassifier = resolveClassifier(),
): Promise<ClassificationResult> {
  const item = await prisma.mediaItem.findUnique({ where: { id: mediaId } });
  if (!item) {
    return {
      provider: classifier.provider,
      labelledStub: true,
      nudity: 'unknown',
      violence: 'unknown',
      note: 'media missing',
    };
  }
  if (item.kind === 'audio') {
    const result: ClassificationResult = {
      provider: classifier.provider,
      labelledStub: classifier.provider === 'stub',
      nudity: 'none',
      violence: 'none',
      note: 'Audio is not classified for nudity or violence.',
    };
    await prisma.mediaClassification.create({
      data: {
        mediaId,
        provider: result.provider,
        labelledStub: result.labelledStub,
        nudity: result.nudity,
        violence: result.violence,
        note: result.note,
      },
    });
    return result;
  }

  const result = await classifier.classify({
    mediaId,
    kind: item.kind === 'video' ? 'video' : 'image',
    mimeType: item.mimeType,
    byteSize: item.byteSize,
  });

  const hold = classificationHolds(result);
  const sensitive = classificationMarksSensitive(result) || item.sensitive;
  let caseId: string | undefined;

  if (hold) {
    const existing = await prisma.moderationCase.findFirst({
      where: { targetKind: item.purpose === 'moment' ? 'moment' : item.purpose === 'loop' ? 'loop' : 'post', targetId: item.postId ?? mediaId, status: { in: ['open', 'in_review'] } },
    });
    const opened =
      existing ??
      (await prisma.moderationCase.create({
        data: {
          source: 'classifier',
          targetKind: item.purpose === 'moment' ? 'moment' : item.purpose === 'loop' ? 'loop' : 'post',
          targetId: item.postId ?? mediaId,
          subjectUserId: item.ownerId,
          summary: `Classifier ${result.provider} held media ${mediaId} (nudity=${result.nudity}, violence=${result.violence}).`,
        },
      }));
    caseId = opened.id;
    log.warn(
      { mediaId, provider: result.provider, nudity: result.nudity, violence: result.violence },
      'classifier held media before publish',
    );
  } else if (result.labelledStub) {
    log.info({ mediaId, provider: result.provider }, 'classifier stub ran; no verdict, content may become visible');
  }

  await prisma.mediaClassification.create({
    data: {
      mediaId,
      provider: result.provider,
      labelledStub: result.labelledStub,
      nudity: result.nudity,
      violence: result.violence,
      note: result.note,
      caseId: caseId ?? null,
    },
  });
  await prisma.mediaItem.update({
    where: { id: mediaId },
    data: { sensitive, moderationHold: hold },
  });
  if (item.postId && sensitive) {
    await prisma.post.update({ where: { id: item.postId }, data: { sensitive: true } });
  }
  return result;
}
