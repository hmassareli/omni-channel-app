import { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/tokens";
import { prisma } from "../prisma";

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "AGENT";
  operationId: string | null;
  mustChangePassword: boolean;
}

/** Valida um bearer token e devolve o e-mail da identidade, ou null. */
export type TokenVerifier = (token: string) => Promise<{ email: string } | null>;

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// ============================================================================
// Verificador de token
// ============================================================================

let verifier: TokenVerifier = verifyAccessToken;

/** Permite injetar um verificador (testes). `undefined` volta ao padrão. */
export function setTokenVerifier(custom: TokenVerifier | undefined) {
  verifier = custom ?? verifyAccessToken;
}

// ============================================================================
// Middlewares
// ============================================================================

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  operationId: true,
  mustChangePassword: true,
} as const;

/**
 * Exige token válido e usuário cadastrado; injeta request.user.
 * Com senha provisória, só as rotas /auth/* ficam liberadas.
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(request);
  if (!token) {
    return reply.status(401).send({ error: "Token de autenticação não fornecido" });
  }

  const identity = await verifier(token);
  if (!identity) {
    return reply.status(401).send({ error: "Token inválido ou expirado" });
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: identity.email },
    select: authUserSelect,
  });
  if (!dbUser) {
    return reply.status(401).send({ error: "Usuário não encontrado" });
  }

  const route = request.routeOptions.url ?? request.url;
  if (dbUser.mustChangePassword && !route.startsWith("/auth/")) {
    return reply
      .status(403)
      .send({ error: "Troque a senha provisória para continuar", code: "PASSWORD_CHANGE_REQUIRED" });
  }

  request.user = dbUser;
}

/** Exige um dos papéis informados (use depois de authMiddleware). */
export function requireRole(...roles: AuthenticatedUser["role"][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Permissão insuficiente" });
    }
  };
}
