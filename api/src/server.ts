import "dotenv/config";
import Fastify from "fastify";
import { PrismaClient } from "./generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { authRoutes }    from "./routes/auth.js";
import { companyRoutes } from "./routes/companies.js";
import { shiftRoutes }   from "./routes/shifts.js";
import { jobRoutes }     from "./routes/jobs.js";
import fastifyStatic     from "@fastify/static";
import cors              from "@fastify/cors";
import path              from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
const app     = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

await app.register(fastifyStatic, {
  root:   path.join(__dirname, "../../planner"),
  prefix: "/planner/",
});

app.get("/health", async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({ ok: true, db: "up", timestamp: new Date().toISOString() });
  } catch (err: any) {
    return reply.status(503).send({ ok: false, db: "down", error: err?.message });
  }
});

await authRoutes(app, prisma);
await companyRoutes(app, prisma);
await shiftRoutes(app, prisma);
await jobRoutes(app, prisma);

process.on("SIGINT",  async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
  app.log.info("✅  Server running on http://localhost:3000");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
