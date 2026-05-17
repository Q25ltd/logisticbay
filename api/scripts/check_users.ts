import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_PROD });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const memberships = await prisma.companyMembership.findMany({
    where: { companyId: 1 },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  console.log("Q25LTD memberships:", JSON.stringify(memberships, null, 2));
}

main().catch(console.error).finally(() => { prisma.$disconnect(); pool.end(); });
