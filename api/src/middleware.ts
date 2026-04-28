import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId:    number;
      companyId: number;
      role:      string;
    };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid Authorization header" });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!) as any;
    request.user = {
      userId:    decoded.userId,
      companyId: decoded.companyId,
      role:      decoded.role,
    };
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
