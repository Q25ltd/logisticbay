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
  createPasswordResetToken,
  createEmailVerificationToken,
} from "../lib/tokens.js";
import type { LoginBody, RefreshBody, LogoutBody, ChangePasswordBody } from "../types/requests.js";
import {
  LoginSchema, RefreshSchema, LogoutSchema, ChangePasswordSchema,
  ForgotPasswordSchema, ResetPasswordSchema, VerifyEmailSchema,
} from "../schemas/auth.js";
import type { ForgotPasswordBody, ResetPasswordBody, VerifyEmailBody } from "../schemas/auth.js";
import { parseBody } from "../lib/validate.js";
import { sendPasswordResetEmail } from "../email.js";
import { badRequest, forbidden, notFound, unauthorized, validationFailed } from "../lib/errors.js";

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes

export async function authRoutes(app: FastifyInstance, prisma: PrismaClient) {

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parsed = parseBody(LoginSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as LoginBody;
    const { email, password } = body;

    const user = await prisma.user.findUnique({
      where:   { email: email.toLowerCase().trim() },
      include: { memberships: { where: { status: "active" }, include: { company: true }, orderBy: { createdAt: "desc" } } },
    });

    // Generic message — do not leak whether the account exists
    if (!user || user.status !== "active") return unauthorized(reply, "Invalid email or password");

    // Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return unauthorized(reply, "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= LOCKOUT_MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_WINDOW_MS) : null;
      await prisma.user.update({
        where: { id: user.id },
        data:  { failedLoginAttempts: attempts, ...(lockedUntil ? { lockedUntil } : {}) },
      });
      return unauthorized(reply, "Invalid email or password");
    }

    // Reset lockout on successful credential check
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data:  { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const memberships = user.memberships;
    if (!memberships.length) return unauthorized(reply, "No active company membership");

    const selectedCompanyId = body.companyId ? parseInt(body.companyId) : null;

    if (memberships.length > 1 && !selectedCompanyId) {
      return reply.send({
        requiresCompanySelection: true,
        companies: memberships.map(m => ({ companyId: m.companyId, companyName: m.company.name, role: m.role })),
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    const membership = selectedCompanyId ? memberships.find(m => m.companyId === selectedCompanyId) : memberships[0];
    if (!membership) return unauthorized(reply, "Company not found or access denied");

    // Block login for companies that have not verified their email yet
    if (membership.company.status === "pending") {
      return forbidden(reply, "Please verify your email address before signing in.", "EMAIL_NOT_VERIFIED");
    }

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
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as RefreshBody;

    let decoded: { userId: number; companyId: number; role: string };
    try {
      decoded = jwt.verify(body.refreshToken, env.JWT_REFRESH_SECRET) as typeof decoded;
    } catch {
      return unauthorized(reply, "Token expired or invalid");
    }

    const hash = hashToken(body.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!stored) {
      return unauthorized(reply, "Token expired or invalid");
    }

    if (stored.revokedAt) {
      await revokeTokenFamily(prisma, stored.familyId);
      return unauthorized(reply, "Token reuse detected. Please log in again.");
    }

    if (stored.expiresAt < new Date()) {
      return unauthorized(reply, "Token expired or invalid");
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const user = await prisma.user.findUnique({
      where:   { id: decoded.userId },
      include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } },
    });
    if (!user || user.status !== "active") return unauthorized(reply, "User not found or inactive");
    const membership = user.memberships[0];
    if (!membership) return unauthorized(reply, "No active membership");

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
    if (!auth?.startsWith("Bearer ")) return unauthorized(reply, "Not authenticated");
    try {
      const decoded = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET) as { userId: number; companyId: number; role: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } } });
      if (!user || user.status !== "active") return unauthorized(reply, "User not found");
      const membership = user.memberships[0];
      if (!membership) return unauthorized(reply, "No active membership");
      return reply.send({ id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role });
    } catch { return unauthorized(reply, "Token expired or invalid"); }
  });

  app.post("/auth/change-password", {
    config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
  }, async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return unauthorized(reply, "Not authenticated");
    const parsed = parseBody(ChangePasswordSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as ChangePasswordBody;
    const { currentPassword, newPassword } = body;
    if (newPassword === "123456") return badRequest(reply, "BAD_REQUEST", "You cannot use the default PIN");
    try {
      const decoded = jwt.verify(auth.slice(7), env.JWT_ACCESS_SECRET) as { userId: number };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) return notFound(reply, "User");
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return unauthorized(reply, "Current password is incorrect");
      const passwordHash = await bcrypt.hash(newPassword, 12);
      // User has no companyId column — safe: id comes from the authenticated JWT userId
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return reply.send({ ok: true, message: "Password changed successfully" });
    } catch { return unauthorized(reply, "Token expired or invalid"); }
  });

  // Only company_owner accounts can request a password reset — drivers/planners reset via admin panel
  app.post("/auth/forgot-password", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const parsed = parseBody(ForgotPasswordSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as ForgotPasswordBody;

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!user || user.status !== "active") return reply.send({ ok: true });

    // Only company_owner role may self-serve password reset
    const ownerMembership = await prisma.companyMembership.findFirst({
      where: { userId: user.id, role: "company_owner", status: "active" },
    });
    if (!ownerMembership) return reply.send({ ok: true });

    const rawToken = await createPasswordResetToken(prisma, user.id);
    const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, user.name, resetUrl);
    } catch {
      // Log but don't expose email errors to caller
    }

    return reply.send({ ok: true });
  });

  app.post("/auth/reset-password", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const parsed = parseBody(ResetPasswordSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as ResetPasswordBody;
    if (body.newPassword === "123456") return badRequest(reply, "BAD_REQUEST", "You cannot use the default PIN");

    const hash = hashToken(body.token);
    const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });

    if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
      return badRequest(reply, "BAD_REQUEST", "Token is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);

    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: tokenRow.id },
        data:  { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: tokenRow.userId },
        data:  { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // Revoke all refresh tokens for this user so existing sessions end
      prisma.refreshToken.updateMany({
        where: { userId: tokenRow.userId, revokedAt: null },
        data:  { revokedAt: new Date() },
      }),
    ]);

    return reply.send({ ok: true, message: "Password has been reset. Please sign in." });
  });

  app.post("/auth/verify-email", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    const parsed = parseBody(VerifyEmailSchema, request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.errors);
    const body = parsed.data as VerifyEmailBody;

    const hash = hashToken(body.token);
    const tokenRow = await prisma.emailVerificationToken.findUnique({
      where:   { tokenHash: hash },
      include: { user: { include: { memberships: { where: { status: "active" }, include: { company: true }, orderBy: { createdAt: "desc" } } } } },
    });

    if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
      return badRequest(reply, "BAD_REQUEST", "Verification link is invalid or has expired");
    }

    const user = tokenRow.user;
    const ownerMembership = user.memberships.find(m => m.role === "company_owner");
    if (!ownerMembership) return badRequest(reply, "BAD_REQUEST", "No company owner membership found");

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: tokenRow.id },
        data:  { usedAt: new Date() },
      }),
      prisma.company.update({
        where: { id: ownerMembership.companyId },
        data:  { status: "trial" },
      }),
    ]);

    // Auto-login: issue tokens so the user lands on the dashboard after verifying
    const tokenPayload = { userId: user.id, companyId: ownerMembership.companyId, role: ownerMembership.role };
    const accessToken  = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    await storeRefreshToken(prisma, {
      userId:    user.id,
      companyId: ownerMembership.companyId,
      token:     refreshToken,
      userAgent: request.headers["user-agent"] ?? "",
    });

    return reply.send({
      ok: true,
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, companyId: ownerMembership.companyId, companyName: ownerMembership.company.name, role: ownerMembership.role },
    });
  });
}
