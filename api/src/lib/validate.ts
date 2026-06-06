/**
 * Zod validation helper for Fastify route handlers.
 *
 * Usage:
 *   import { parseBody } from "../lib/validate.js";
 *   import { CreateDriverSchema } from "../schemas/drivers.js";
 *
 *   const result = parseBody(CreateDriverSchema, request.body);
 *   if (!result.ok) return reply.status(400).send({ error: "Validation failed", details: result.errors });
 *   const body = result.data; // fully typed, validated data
 */

import { ZodSchema, ZodError } from "zod";

export type ParseResult<T> =
  | { ok: true;  data: T }
  | { ok: false; errors: string[] };

/** Parse and validate request body against a Zod schema. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: formatZodErrors(result.error) };
}

/** Parse and validate query parameters against a Zod schema. */
export function parseQuery<T>(schema: ZodSchema<T>, query: unknown): ParseResult<T> {
  const result = schema.safeParse(query);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: formatZodErrors(result.error) };
}

function formatZodErrors(err: ZodError): string[] {
  return err.issues.map(issue => {
    const path = issue.path.length ? issue.path.join(".") + ": " : "";
    return `${path}${issue.message}`;
  });
}

/**
 * Parse an integer path parameter from request.params.
 *
 * A.12 fix: `parseInt((request.params as {...}).id, 10)` repeated 50+ times
 * across route handlers, never validating the result. `parseInt("abc", 10)`
 * returns `NaN` → Prisma silently returns nothing → caller gets a 404 instead
 * of a 400. This helper returns null on failure so the caller can send 400.
 *
 * Usage:
 *   const id = parseIdParam(request.params);
 *   if (id === null) return reply.status(400).send({ error: "BAD_REQUEST", message: "id must be a valid integer" });
 */
export function parseIdParam(params: unknown, key = "id"): number | null {
  const raw = (params as Record<string, string>)[key];
  const n   = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
