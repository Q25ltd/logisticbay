/**
 * Run route schemas. Split guardrails: the planner chooses how much stays on
 * this run (keepQuantity); the remainder moves to the new split run. The
 * route additionally verifies at least one load actually exceeds the kept
 * amount, so shares always balance back to the job total.
 */
import { z } from "zod";

export const SplitRunSchema = z.object({
  keepQuantity: z.number().positive("keepQuantity must be a positive number").max(100000),
});
