/**
 * Unified error response helpers — TASK 3.7 / Commandment 20.
 *
 * All 4xx responses from route handlers MUST go through one of these helpers.
 * They enforce the single error envelope shape:
 *   { error: string, code?: string, details?: unknown }
 *
 * CI gate (must stay green):
 *   grep -rn "reply.status(4" api/src/routes --include="*.ts" → 0 hits
 *
 * Rationale: the API previously returned at least four different shapes
 * (plain { error }, { error, message }, { error, details }, { error, code }).
 * Web and mobile clients had to guess. One shape means one parser.
 *
 * Usage:
 *   import { notFound, badRequest, forbidden, conflict, validationFailed } from "../lib/errors.js";
 *
 *   return notFound(reply, "Job");
 *   return badRequest(reply, "VEHICLE_REQUIRED", "Vehicle type must be selected.");
 *   return forbidden(reply, "Not your job");
 *   return conflict(reply, "DUPLICATE_REF", "Reference already in use");
 *   return validationFailed(reply, ["name: Required"]);
 */

import type { FastifyReply } from "fastify";

// ── Envelope type — exported so tests can assert the shape ────────────────────

export interface ErrorEnvelope {
  error:     string;
  code?:     string;
  details?:  unknown;
}

// ── Helpers — each calls reply.status(x).send(envelope) and returns the result

/** 404 — entity not found. code = `ENTITY_NOT_FOUND` */
export function notFound(reply: FastifyReply, entity: string): ReturnType<FastifyReply["send"]> {
  return reply.status(404).send({
    error: `${entity} not found`,
    code:  `${entity.toUpperCase().replace(/\s+/g, "_")}_NOT_FOUND`,
  } satisfies ErrorEnvelope);
}

/**
 * 400 — invalid input.
 * @param code    Machine-readable error code e.g. "VEHICLE_REQUIRED"
 * @param message Human-readable explanation
 * @param details Optional array of field-level errors (Zod issues, etc.)
 */
export function badRequest(
  reply:   FastifyReply,
  code:    string,
  message: string,
  details?: unknown,
): ReturnType<FastifyReply["send"]> {
  const body: ErrorEnvelope = { error: message, code };
  if (details !== undefined) body.details = details;
  return reply.status(400).send(body);
}

/** 401 — not authenticated or token invalid */
export function unauthorized(reply: FastifyReply, message = "Unauthorized"): ReturnType<FastifyReply["send"]> {
  return reply.status(401).send({ error: message, code: "UNAUTHORIZED" } satisfies ErrorEnvelope);
}

/** 403 — authenticated but not authorised */
export function forbidden(reply: FastifyReply, message = "Forbidden", code = "FORBIDDEN"): ReturnType<FastifyReply["send"]> {
  return reply.status(403).send({ error: message, code } satisfies ErrorEnvelope);
}

/** 409 — state conflict */
export function conflict(reply: FastifyReply, code: string, message: string): ReturnType<FastifyReply["send"]> {
  return reply.status(409).send({ error: message, code } satisfies ErrorEnvelope);
}

/**
 * 400 — Zod / schema validation failure.
 * @param errors Array of human-readable field error strings from parseBody / parseQuery.
 */
export function validationFailed(reply: FastifyReply, errors: string[]): ReturnType<FastifyReply["send"]> {
  return reply.status(400).send({
    error:   "Validation failed",
    code:    "VALIDATION_FAILED",
    details: errors,
  } satisfies ErrorEnvelope);
}
