import { z } from "zod/v4";

export const createClipSchema = z.object({
  name: z.string().min(1).max(100),
  duration: z.coerce.number().positive(),
  filterConfig: z
    .string()
    .transform((s) => JSON.parse(s))
    .pipe(
      z.array(
        z.object({
          id: z.string(),
          params: z.record(z.string(), z.number()),
        })
      )
    )
    .optional(),
});

export const clipListParamsSchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type CreateClipInput = z.infer<typeof createClipSchema>;
