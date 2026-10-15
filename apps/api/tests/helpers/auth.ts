import type { TokenVerifier } from "../../src/middleware/auth";
import { prisma } from "../../src/prisma";

let seq = 0;

/** Verificador de teste: o token é o próprio e-mail. */
export const testTokenVerifier: TokenVerifier = async (token) => ({ email: token });

export function authHeader(email: string) {
  return { authorization: `Bearer ${email}` };
}

/** Cria Operation (se necessário), User e, opcionalmente, o Agent vinculado. */
export async function createAuthedUser(
  opts: {
    role?: "ADMIN" | "MANAGER" | "AGENT";
    operationId?: string;
    name?: string;
    withAgent?: boolean;
  } = {},
) {
  const n = ++seq;
  const operationId =
    opts.operationId ?? (await prisma.operation.create({ data: { name: `Op ${n}` } })).id;
  const user = await prisma.user.create({
    data: {
      email: `authed${n}-${Date.now()}@test.com`,
      name: opts.name ?? `Usuário ${n}`,
      role: opts.role ?? "AGENT",
      operationId,
    },
  });
  const agent =
    opts.withAgent === false
      ? null
      : await prisma.agent.create({
          data: { name: user.name, operationId, userId: user.id },
        });
  return { user, agent, operationId, email: user.email, headers: authHeader(user.email) };
}
