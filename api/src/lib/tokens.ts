import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import type { PrismaClient } from "../generated/client.js";

const RESET_TTL_MS  = 60 * 60 * 1000;        // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const ACCESS_TTL  = "8h";
const REFRESH_TTL = "30d";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(payload: object): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export async function storeRefreshToken(
  prisma: PrismaClient,
  opts: { userId: number; companyId: number; token: string; userAgent?: string; familyId?: string },
): Promise<string> {
  const familyId = opts.familyId ?? crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      userId:    opts.userId,
      companyId: opts.companyId,
      tokenHash: hashToken(opts.token),
      familyId,
      userAgent: opts.userAgent ?? "",
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return familyId;
}

/**
 * Verify a JWT access token and return the decoded payload.
 * Throws if the token is invalid or expired.
 * C21: all jwt.verify calls must live in this file or middleware.ts.
 */
export function verifyAccessToken(token: string): { userId: number; companyId: number; role: string } {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId: number; companyId: number; role: string };
}

/**
 * Verify a JWT refresh token and return the decoded payload.
 * Throws if the token is invalid or expired.
 */
export function verifyRefreshToken(token: string): { userId: number; companyId: number; role: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: number; companyId: number; role: string };
}

export async function revokeTokenFamily(prisma: PrismaClient, familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where:  { familyId, revokedAt: null },
    data:   { revokedAt: new Date() },
  });
}

export async function createPasswordResetToken(prisma: PrismaClient, userId: number): Promise<string> {
  const raw  = generateSecureToken();
  const hash = hashToken(raw);
  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data:  { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  return raw;
}

export async function createEmailVerificationToken(prisma: PrismaClient, userId: number): Promise<string> {
  const raw  = generateSecureToken();
  const hash = hashToken(raw);
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data:  { usedAt: new Date() },
  });
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  return raw;
}
