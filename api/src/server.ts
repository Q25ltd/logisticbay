import "dotenv/config";
import Fastify from "fastify";
import { PrismaClient } from "./generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { authRoutes }         from "./routes/auth.js";
import { companyRoutes }      from "./routes/companies.js";
import { customerRoutes }     from "./routes/customers.js";
import { shiftRoutes }        from "./routes/shifts.js";
import { jobRoutes }          from "./routes/jobs.js";
import { syncRoutes }         from "./routes/sync.js";
import { healthRoutes }       from "./routes/health.js";
import { availabilityRoutes } from "./routes/availability.js";
import { fleetRoutes }        from "./routes/fleet.js";
import cors              from "@fastify/cors";


const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
const app     = Fastify({ logger: true });

const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://logisticbay.com", "https://www.logisticbay.com", "https://logisticbay.vercel.app"]
  : true;

await app.register(cors, {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-App-Version", "Idempotency-Key"],
  credentials: true,
});

app.addHook("onResponse", async (request, reply) => {
  app.log.info({
    requestId: request.id,
    userId:    request.user?.userId,
    companyId: request.user?.companyId,
    role:      request.user?.role,
    method:    request.method,
    url:       request.url,
    statusCode: reply.statusCode,
  }, "request completed");
});

// Rate limiting
await app.register(import("@fastify/rate-limit").then(m => m.default), {
  max: 100,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please try again later.",
  }),
});

// Global error handler
app.setErrorHandler((error, request, reply) => {
  const err = error as any;
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 500) {
    app.log.error({
      err: error,
      requestId: request.id,
      userId:    request.user?.userId,
      companyId: request.user?.companyId,
      role:      request.user?.role,
      method:    request.method,
      url:       request.url,
    }, "Internal server error");
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Something went wrong. Please try again.",
    });
  }
  return reply.status(statusCode).send({
    error: err.code ?? "ERROR",
    message: err.message,
  });
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
await customerRoutes(app, prisma);
await shiftRoutes(app, prisma);
await jobRoutes(app, prisma);
await syncRoutes(app, prisma);
await availabilityRoutes(app, prisma);
await fleetRoutes(app, prisma);

process.on("SIGINT",  async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
  app.log.info("✅  Server running on http://localhost:3000");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
