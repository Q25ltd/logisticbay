import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  storeRefreshToken,
  revokeTokenFamily,
} from "../lib/tokens.js";
import type { LoginBody, RefreshBody, LogoutBody, ChangePasswordBody } from "../types/requests.js";
import { LoginSchema, RefreshSchema, LogoutSchema, ChangePasswordSchema } from "../schemas/auth.js";
import { parseBody } from "../lib/validate.js";

export async function authRoutes(app: FastifyInstance, prisma: PrismaClient) {

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parsed = parseBody(LoginSchema, request.body);
    if (!parsed.ok) return reply.status(400).send({ error: "Validation failed", details: parsed.errors });
    const body = parsed.data as LoginBody;
    const { email, password } = body;

    const user = await prisma.user.findUnique({
      where:   { email: email.toLowerCase().trim() },
      include: { memberships: { where: { status: "active" }, include: { company: true }, orderBy: { createdAt: "desc" } } },
    });

    if (!user || user.status !== "active") return reply.status(401).send({ error: "Invalid email or password" });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: "Invalid email or password" });

    const memberships = user.memberships;
    if (!memberships.length) return reply.status(401).send({ error: "No active company membership" });

    const selectedCompanyId = body.companyId ? parseInt(body.companyId) : null;

    if (memberships.length > 1 && !selectedCompanyId) {
      return reply.send({
        requiresCompanySelection: true,
        companies: memberships.map(m => ({ companyId: m.companyId, companyName: m.company.name, role: m.role })),
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    const membership = selectedCompanyId ? memberships.find(m => m.companyId === selectedCompanyId) : memberships[0];
    if (!membership) return reply.status(401).send({ error: "Company not found or access denied" });

    const tokenPayload = { userId: user.id, companyId: membership.companyId, role: membership.role };
    const accessToken  = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await storeRefreshToken(prisma, {
      userId:    user.id,
      companyId: membership.companyId,
      token:     refreshToken,
      userAgent: request.headers["user-agent"] ?? "",
    });

    const usingDefaultPin = await bcrypt.compare("123456", user.passwordHash);

    return reply.send({
      accessToken, refreshToken,
      mustChangePin: usingDefaultPin && membership.role === "driver",
      user: { id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role },
    });
  });

  app.post("/auth/refresh", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parsed = parseBody(RefreshSchema, request.body);
    if (!parsed.ok) return reply.status(400).send({ error: "Validation failed", details: parsed.errors });
    const body = parsed.data as RefreshBody;

    let decoded: { userId: number; companyId: number; role: string };
    try {
      decoded = jwt.verify(body.refreshToken, env.JWT_REFRESH_SECRET) as typeof decoded;
    } catch {
      return reply.status(401).send({ error: "Token expired or invalid" });
    }

    const hash = hashToken(body.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!stored) {
      return reply.status(401).send({ error: "Token expired or invalid" });
    }

    if (stored.revokedAt) {
      await revokeTokenFamily(prisma, stored.familyId);
      return reply.status(401).send({ error: "Token reuse detected. Please log in again." });
    }

    if (stored.expiresAt < new Date()) {
      return reply.status(401).send({ error: "Token expired or invalid" });
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const user = await prisma.user.findUnique({
      where:   { id: decoded.userId },
      include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } },
    });
    if (!user || user.status !== "active") return reply.status(401).send({ error: "User not found or inactive" });
    const membership = user.memberships[0];
    if (!membership) return reply.status(401).send({ error: "No active membership" });

    const newPayload      = { userId: user.id, companyId: membership.companyId, role: membership.role };
    const newAccessToken  = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    await storeRefreshToken(prisma, {
      userId:    user.id,
      companyId: membership.companyId,
      token:     newRefreshToken,
      userAgent: request.headers["user-agent"] ?? "",
      familyId:  stored.familyId,
    });

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role },
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const parsed = parseBody(LogoutSchema, request.body);
    if (!parsed.ok) return reply.status(200).send({ ok: true });
    const body = parsed.data as LogoutBody;

    const hash = hashToken(body.refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data:  { revokedAt: new Date() },
    });

    return reply.send({ ok: true });
  });

  app.get("/auth/me", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ error: "Not authenticated" });
    try {
      const decoded = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET) as { userId: number; companyId: number; role: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } } });
      if (!user || user.status !== "active") return reply.status(401).send({ error: "User not found" });
      const membership = user.memberships[0];
      if (!membership) return reply.status(401).send({ error: "No active membership" });
      return reply.send({ id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role });
    } catch { return reply.status(401).send({ error: "Token expired or invalid" }); }
  });

  app.post("/auth/change-password", {
    config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
  }, async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ error: "Not authenticated" });
    const parsed = parseBody(ChangePasswordSchema, request.body);
    if (!parsed.ok) return reply.status(400).send({ error: "Validation failed", details: parsed.errors });
    const body = parsed.data as ChangePasswordBody;
    const { currentPassword, newPassword } = body;
    const isPin = /^\d{6}$/.test(newPassword);
    if (!isPin && newPassword.length < 8) return reply.status(400).send({ error: "PIN must be 6 digits, or password at least 8 characters" });
    if (newPassword === "123456") return reply.status(400).send({ error: "You cannot use the default PIN" });
    try {
      const decoded = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET) as { userId: number };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return reply.status(404).send({ error: "User not found" });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.status(401).send({ error: "Current password is incorrect" });
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return reply.send({ ok: true, message: "Password changed successfully" });
    } catch { return reply.status(401).send({ error: "Token expired or invalid" }); }
  });
}
