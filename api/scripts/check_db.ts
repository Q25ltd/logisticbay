import "dotenv/config";
import { PrismaClient } from "../src/generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_PROD });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log("Companies:", JSON.stringify(companies, null, 2));
  const customers = await prisma.customer.findMany({ select: { id: true, companyId: true, name: true }, take: 10 });
  console.log("Customers:", JSON.stringify(customers, null, 2));
  const drivers = await prisma.driverProfile.findMany({ select: { id: true, companyId: true, displayName: true }, take: 10 });
  console.log("Drivers:", JSON.stringify(drivers, null, 2));
  const jobs = await prisma.plannedJob.findMany({ select: { id: true, companyId: true, jobReference: true, status: true }, take: 5 });
  console.log("Existing jobs:", JSON.stringify(jobs, null, 2));
}

main().catch(console.error).finally(() => { prisma.$disconnect(); pool.end(); });
