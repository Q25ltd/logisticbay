import type { FastifyInstance } from "fastify";
import { parseIdParam } from "../lib/validate.js";
import { PrismaClient } from "../generated/client.js";
import { authenticate, requireRole } from "../middleware.js";
import { badRequest, notFound, validationFailed } from "../lib/errors.js";

interface CreateCustomerBody {
  name:          string;
  contactName?:  string;
  contactPhone?: string;
  contactEmail?: string;
}

interface PatchCustomerBody {
  name?:         string;
  contactName?:  string;
  contactPhone?: string;
  contactEmail?: string;
  status?:       "active" | "archived";
}

function validateCreate(body: CreateCustomerBody): string[] {
  const errors: string[] = [];
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    errors.push("Customer name is required");
  }
  return errors;
}

export async function customerRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── GET /customers ────────────────────────────────────────────────────────
  app.get("/customers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const { companyId } = request.user!;
    const q = request.query as { status?: string; search?: string };

    const customers = await prisma.customer.findMany({
      where: {
        companyId,
        status: q.status ?? "active",
        ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
    });

    return reply.send({ data: customers });
  });

  // ── GET /customers/:id ───────────────────────────────────────────────────
  app.get("/customers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const { companyId } = request.user!;

    const customer = await prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) return notFound(reply, "Customer");

    return reply.send(customer);
  });

  // ── POST /customers ───────────────────────────────────────────────────────
  app.post("/customers", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const body = request.body as CreateCustomerBody;
    const { companyId } = request.user!;

    const errors = validateCreate(body);
    if (errors.length) return validationFailed(reply, errors);

    const customer = await prisma.customer.create({
      data: {
        companyId,
        name:         body.name.trim(),
        contactName:  body.contactName?.trim()  || null,
        contactPhone: body.contactPhone?.trim() || null,
        contactEmail: body.contactEmail?.trim() || null,
        status:       "active",
      },
    });

    return reply.status(201).send(customer);
  });

  // ── PATCH /customers/:id ──────────────────────────────────────────────────
  app.patch("/customers/:id", { preHandler: [authenticate, requireRole("company_owner", "planner")] }, async (request, reply) => {
    const id   = parseIdParam(request.params);
    if (id === null) return badRequest(reply, "BAD_REQUEST", "id must be a valid integer");
    const body = request.body as PatchCustomerBody;
    const { companyId } = request.user!;

    const customer = await prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) return notFound(reply, "Customer");

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name:         body.name?.trim()  ?? customer.name,
        contactName:  body.contactName  !== undefined ? (body.contactName.trim()  || null) : customer.contactName,
        contactPhone: body.contactPhone !== undefined ? (body.contactPhone.trim() || null) : customer.contactPhone,
        contactEmail: body.contactEmail !== undefined ? (body.contactEmail.trim() || null) : customer.contactEmail,
        status:       body.status ?? customer.status,
      },
    });

    return reply.send(updated);
  });
}
