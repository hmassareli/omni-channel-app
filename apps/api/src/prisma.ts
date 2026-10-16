import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

// passwordHash nunca sai em consultas comuns; quem precisa pede com `select`
export const prisma = new PrismaClient({
  adapter,
  omit: { user: { passwordHash: true } },
});

export type PrismaClientInstance = typeof prisma;
