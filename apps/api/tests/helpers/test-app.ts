import { FastifyInstance } from "fastify";
import { buildApp } from "../../src/index";
import { testTokenVerifier } from "./auth";

let app: FastifyInstance | null = null;

/**
 * Retorna a instância do app para testes.
 * Reutiliza a mesma configuração do app de produção.
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp({ tokenVerifier: testTokenVerifier });
    await app.ready();
  }
  return app!;
}

/**
 * Fecha a instância do app de teste
 */
export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
