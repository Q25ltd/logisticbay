import { PrismaClient } from "../generated/prisma/index.js";
import type { FastifyInstance } from "fastify";

const prisma = new PrismaClient();

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ server: "up", db: "up" });
    } catch {
      return reply.status(503).send({ server: "up", db: "down" });
    }
  });
}
