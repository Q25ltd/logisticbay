import type { FastifyInstance } from "fastify";
import { PrismaClient } from "../generated/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function generateToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!, { expiresIn: "7d" });
}
function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET!, { expiresIn: "30d" });
}

export async function authRoutes(app: FastifyInstance, prisma: PrismaClient) {

  app.post("/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = request.body as any;
    const { email, password } = body;
    if (!email || !password) return reply.status(400).send({ error: "Email and password are required" });

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

    const token = generateToken({ userId: user.id, companyId: membership.companyId, role: membership.role });
    const refreshToken = jwt.sign({ userId: user.id, companyId: membership.companyId, role: membership.role }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    const usingDefaultPin = await bcrypt.compare("123456", user.passwordHash);

    return reply.send({
      accessToken: token, refreshToken,
      mustChangePin: usingDefaultPin && membership.role === "driver",
      user: { id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role },
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = request.body as any;
    if (!body.refreshToken) return reply.status(400).send({ error: "Refresh token required" });
    try {
      const decoded = jwt.verify(body.refreshToken, process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET!) as any;
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } } });
      if (!user || user.status !== "active") return reply.status(401).send({ error: "User not found or inactive" });
      const membership = user.memberships[0];
      if (!membership) return reply.status(401).send({ error: "No active membership" });
      const newToken = generateToken({ userId: user.id, companyId: membership.companyId, role: membership.role });
      return reply.send({ accessToken: newToken, user: { id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role } });
    } catch { return reply.status(401).send({ error: "Token expired or invalid" }); }
  });

  app.get("/auth/me", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ error: "Not authenticated" });
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!) as any;
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, include: { memberships: { where: { companyId: decoded.companyId, status: "active" }, include: { company: true }, take: 1 } } });
      if (!user || user.status !== "active") return reply.status(401).send({ error: "User not found" });
      const membership = user.memberships[0];
      if (!membership) return reply.status(401).send({ error: "No active membership" });
      return reply.send({ id: user.id, name: user.name, email: user.email, companyId: membership.companyId, companyName: membership.company.name, role: membership.role });
    } catch { return reply.status(401).send({ error: "Token expired or invalid" }); }
  });

  app.post("/auth/change-password", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return reply.status(401).send({ error: "Not authenticated" });
    const body = request.body as any;
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) return reply.status(400).send({ error: "Current and new password are required" });
    const isPin = /^\d{6}$/.test(newPassword);
    if (!isPin && newPassword.length < 8) return reply.status(400).send({ error: "PIN must be 6 digits, or password at least 8 characters" });
    if (newPassword === "123456") return reply.status(400).send({ error: "You cannot use the default PIN" });
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET!) as any;
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
