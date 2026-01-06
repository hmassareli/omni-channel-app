import path from "path";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

// Carrega o .env do diretório correto
dotenv.config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
});
