import { z } from 'zod';

export const PR_STORY_MIME = 'application/vnd.pi.pr-story+json';
export const PR_STORY_ARTIFACT_KIND = 'pr-story';

export const TokenClassSchema = z.enum(['tk-kw', 'tk-fn', 'tk-str', 'tk-num', 'tk-com', 'tk-ty']);
export type TokenClass = z.infer<typeof TokenClassSchema>;

export const DiffRowSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hunk'), text: z.string() }),
  z.object({
    kind: z.enum(['ctx', 'add', 'rem']),
    lnOld: z.number().int().nullable(),
    lnNew: z.number().int().nullable(),
    tokens: z.array(z.object({ cls: TokenClassSchema.nullable(), text: z.string() })),
    lineId: z.string().optional(),
  }),
]);
export type DiffRow = z.infer<typeof DiffRowSchema>;

export const PrStoryPrSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  author: z.string().optional(),
  branch: z.string().optional(),
  baseBranch: z.string().optional(),
  headSha: z.string().optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  filesChanged: z.number().int().nonnegative().optional(),
});
export type PrStoryPr = z.infer<typeof PrStoryPrSchema>;

export const PrStoryChapterSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  titleMd: z.string().optional(),
  bodyMd: z.string().optional(),
  frameIds: z.array(z.string().min(1)),
});
export type PrStoryChapter = z.infer<typeof PrStoryChapterSchema>;

export const CoverageSummarySchema = z.object({
  totalChangedLines: z.number().int().nonnegative(),
  reviewedChangedLines: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
  strict: z.boolean().optional(),
});
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

export const PrStoryFrameSchema = z.object({
  id: z.string().min(1),
  chapterId: z.string().min(1).optional(),
  titleMd: z.string().optional(),
  narrativeMd: z.string().optional(),
  transitionMd: z.string().optional(),
  file: z.string().min(1),
  hunkHeader: z.string().optional(),
  postLineRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  isNewFile: z.boolean().optional(),
  rows: z.array(DiffRowSchema),
  coverage: z.object({
    changedLineIds: z.array(z.string()),
    reviewed: z.boolean(),
  }).optional(),
});
export type PrStoryFrame = z.infer<typeof PrStoryFrameSchema>;

export const PrStorySchemaBase = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  theme: z.string().optional(),
  pr: PrStoryPrSchema,
  narrative: z.object({
    strategy: z.string().min(1),
    rationale: z.string().optional(),
    estimatedMinutes: z.number().int().positive().optional(),
    heroTitleMd: z.string().optional(),
    heroSubtitleMd: z.string().optional(),
  }),
  chapters: z.array(PrStoryChapterSchema),
  frames: z.array(PrStoryFrameSchema).min(1),
  coverage: CoverageSummarySchema.optional(),
});
export type PrStory = z.infer<typeof PrStorySchemaBase>;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePrStory(input: unknown): ValidationResult {
  const parsed = PrStorySchemaBase.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'story'}: ${i.message}`) };
  const story = parsed.data;
  const errors: string[] = [];

  const frameIds = new Set<string>();
  for (const frame of story.frames) {
    if (frameIds.has(frame.id)) errors.push(`duplicate frame id: ${frame.id}`);
    frameIds.add(frame.id);
  }
  const chapterIds = new Set<string>();
  for (const chapter of story.chapters) {
    if (chapterIds.has(chapter.id)) errors.push(`duplicate chapter id: ${chapter.id}`);
    chapterIds.add(chapter.id);
    for (const frameId of chapter.frameIds) if (!frameIds.has(frameId)) errors.push(`chapter ${chapter.id} references missing frame ${frameId}`);
  }
  for (const frame of story.frames) {
    if (frame.chapterId && !chapterIds.has(frame.chapterId)) errors.push(`frame ${frame.id} references missing chapter ${frame.chapterId}`);
    const rowIds = new Set<string>();
    for (const row of frame.rows) {
      if (row.kind !== 'hunk' && row.lineId) {
        if (rowIds.has(row.lineId)) errors.push(`frame ${frame.id} has duplicate row lineId ${row.lineId}`);
        rowIds.add(row.lineId);
      }
    }
    for (const id of frame.coverage?.changedLineIds ?? []) if (!rowIds.has(id)) errors.push(`frame ${frame.id} coverage references missing row lineId ${id}`);
  }
  if (story.coverage && story.coverage.reviewedChangedLines > story.coverage.totalChangedLines) errors.push('coverage reviewedChangedLines exceeds totalChangedLines');
  if (story.coverage) {
    const expectedPercent = story.coverage.totalChangedLines === 0 ? 100 : Math.round((story.coverage.reviewedChangedLines / story.coverage.totalChangedLines) * 10000) / 100;
    if (Math.abs(expectedPercent - story.coverage.percent) > 0.01) errors.push(`coverage percent ${story.coverage.percent} does not match ${expectedPercent}`);
  }
  return { ok: errors.length === 0, errors };
}

export function coercePrStory(input: unknown): PrStory {
  const validation = validatePrStory(input);
  if (!validation.ok) throw new Error(`Invalid PR Story: ${validation.errors.join('; ')}`);
  return PrStorySchemaBase.parse(input);
}
