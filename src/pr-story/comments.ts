import { z } from 'zod';

export const PrStoryDraftCommentSchema = z.object({
  id: z.string().min(1),
  storyId: z.string().min(1),
  frameId: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().nonnegative().optional(),
  side: z.enum(['LEFT', 'RIGHT']).optional(),
  bodyMd: z.string().min(1).max(20_000),
  selectedText: z.string().max(50_000).optional(),
  createdAt: z.string().min(1),
  kind: z.enum(['line', 'chunk']).default('line'),
});
export type PrStoryDraftComment = z.infer<typeof PrStoryDraftCommentSchema>;

export const PrStoryCommentBatchSchema = z.object({
  submissionId: z.string().min(1),
  storyId: z.string().min(1),
  comments: z.array(PrStoryDraftCommentSchema).min(1).max(100),
  submittedAt: z.string().min(1),
});
export type PrStoryCommentBatch = z.infer<typeof PrStoryCommentBatchSchema>;
