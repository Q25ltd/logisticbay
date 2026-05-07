import "dotenv/config";
import { PrismaClient } from "./generated/client.js";
import { PrismaPg }     from "@prisma/adapter-pg";
import { buildApp }     from "./app.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });
const app     = await buildApp(prisma);

process.on("SIGINT",  async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await app.close(); await prisma.$disconnect(); process.exit(0); });

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
  app.log.info("✅  Server running on http://localhost:3000");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
