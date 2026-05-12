import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "./lib/env.js";

const JwtPayload = z.object({
  userId:    z.number(),
  companyId: z.number(),
  role:      z.string(),
});

declare module "fastify" {
  interface FastifyRequest {
    user?: z.infer<typeof JwtPayload>;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid Authorization header" });
  }
  try {
    const raw     = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET);
    const decoded = JwtPayload.parse(raw);
    request.user  = decoded;
  } catch {
    return reply.status(401).send({ error: "Token expired or invalid" });
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}
