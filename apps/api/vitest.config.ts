import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Desabilita paralelismo para evitar conflitos no banco de dados compartilhado
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Executa testes em sequência para evitar conflitos no banco
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules", "tests", "prisma"],
    },
  },
});
