// Production SlotExtractor: MiniCPM (fast) via the provider chain. Flat string
// slots only — sized for a 1B model. Never used in unit tests.
import { generateObject } from "ai";
import { z } from "zod";
import { tryModels } from "@/lib/ai";
import type { SlotExtractor } from "./intent";

const SlotSchema = z.object({
  period: z.string().nullable(),
  metric: z.string().nullable(),
  stage: z.string().nullable(),
  size: z.string().nullable(),
  batch: z.string().nullable(),
});

export const llmSlotExtractor: SlotExtractor = async (text) => {
  const { object } = await tryModels(
    (model) =>
      generateObject({
        model,
        schema: SlotSchema,
        system:
          "Extract quality-analytics filters from the question. Return null for any " +
          "field not clearly mentioned. Do not invent values.",
        prompt: `Question: ${text}`,
        temperature: 0,
        maxRetries: 1,
      }),
    { fast: true },
  );
  return {
    period: object.period ?? undefined,
    metric: object.metric ?? undefined,
    stage: object.stage ?? undefined,
    size: object.size ?? undefined,
    batch: object.batch ?? undefined,
  };
};
