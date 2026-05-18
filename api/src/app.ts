import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient }        from "./generated/client.js";
import { authRoutes }          from "./routes/auth.js";
import { companyRoutes }       from "./routes/companies.js";
import { customerRoutes }      from "./routes/customers.js";
import { shiftRoutes }         from "./routes/shifts.js";
import { jobRoutes }           from "./routes/jobs.js";
import { syncRoutes }          from "./routes/sync.js";
import { availabilityRoutes }  from "./routes/availability.js";
import { fleetRoutes }         from "./routes/fleet.js";
import { dashboardRoutes }     from "./routes/dashboard.js";
import { jobRequestRoutes }    from "./routes/jobRequests.js";
import { requestLinkRoutes }   from "./routes/requestLinks.js";
import { runRoutes }           from "./routes/runs.js";
import { locationRoutes }      from "./routes/locations.js";
import { templateRoutes }      from "./routes/templates.js";
import { scheduleRoutes }      from "./routes/schedule.js";
import cors                    from "@fastify/cors";

export async function buildApp(
  prisma: PrismaClient,
  opts: { silent?: boolean } = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.silent ? false : true });

  const allowedOrigins = process.env.NODE_ENV === "production"
    ? ["https://logisticbay.com", "https://www.logisticbay.com", "https://logisticbay.vercel.app",
       // Public intake form — no auth required, must be allowed from anywhere a customer might open it
       /^https:\/\/.*\.logisticbay\.com$/,
      ]
    : true;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Version", "Idempotency-Key"],
    credentials: true,
  });

  app.addHook("onResponse", async (request, reply) => {
    if (opts.silent) return;
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

  await app.register(import("@fastify/rate-limit").then(m => m.default), {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as any;
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error({
        err: error,
        requestId: request.id,
        userId:    request.user?.userId,
        companyId: request.user?.companyId,
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
  await dashboardRoutes(app, prisma);
  await jobRequestRoutes(app, prisma);
  await requestLinkRoutes(app, prisma);
  await runRoutes(app, prisma);
  await locationRoutes(app, prisma);
  await templateRoutes(app, prisma);
  await scheduleRoutes(app, prisma);

  return app;
}
