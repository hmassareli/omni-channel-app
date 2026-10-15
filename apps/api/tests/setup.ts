import { execSync } from "child_process";
import dotenv from "dotenv";
import { afterAll, beforeAll, beforeEach } from "vitest";

// Carrega variáveis do .env.test ANTES de importar o prisma
// Usa override: true para garantir que .env.test sobrescreve o .env padrão
dotenv.config({ path: ".env.test", override: true });

// Importa o prisma do projeto (vai usar DATABASE_URL do .env.test)
import { prisma } from "../src/prisma";

beforeAll(async () => {
  console.log("🔧 Preparando banco de teste...");

  // Roda as migrations no banco de teste
  try {
    execSync("npx prisma migrate deploy", {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      stdio: "inherit",
    });
    console.log("✅ Migrations aplicadas");
  } catch (error) {
    console.error("❌ Erro ao aplicar migrations:", error);
    throw error;
  }
});

beforeEach(async () => {
  // Limpa todas as tabelas antes de cada teste
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
  console.log("🔌 Conexão com banco de teste encerrada");
});

/**
 * Limpa todas as tabelas do banco de dados na ordem correta
 * (respeitando foreign keys)
 */
async function cleanDatabase() {
  // Ordem de deleção respeitando dependências
  const deleteOrder = [
    "csatResponse",
    "queueMember",
    "rawWhatsappMessage",
    "contactInsight",
    "contactTag",
    "timelineEvent",
    "message",
    "conversation",
    "identity",
    "contact",
    "insightDefinition",
    "tag",
    "opportunity",
    "stage",
    "company",
    "queue",
    "whatsAppChannel",
    "channel",
    "agent",
    "user",
    "operation",
  ] as const;

  for (const table of deleteOrder) {
    try {
      // @ts-ignore - acessando dinamicamente
      await prisma[table]?.deleteMany();
    } catch {
      // Ignora se a tabela não existir
    }
  }
}
