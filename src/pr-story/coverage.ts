import { z } from 'zod';

export const ChangedLineSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  hunkIndex: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  kind: z.enum(['add', 'rem']),
  side: z.enum(['RIGHT', 'LEFT']),
  oldLine: z.number().int().nullable(),
  newLine: z.number().int().nullable(),
  text: z.string(),
  status: z.enum(['pending', 'reviewed', 'failed']).default('pending'),
  reviewId: z.string().optional(),
});
export type ChangedLine = z.infer<typeof ChangedLineSchema>;

export const CoverageLedgerSchema = z.object({
  storyId: z.string().optional(),
  prKey: z.string().optional(),
  headSha: z.string().optional(),
  lines: z.array(ChangedLineSchema),
});
export type CoverageLedger = z.infer<typeof CoverageLedgerSchema>;
