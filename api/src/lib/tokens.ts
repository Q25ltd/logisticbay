import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import type { PrismaClient } from "../generated/client.js";

const ACCESS_TTL  = "15m";
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

export async function revokeTokenFamily(prisma: PrismaClient, familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where:  { familyId, revokedAt: null },
    data:   { revokedAt: new Date() },
  });
}
