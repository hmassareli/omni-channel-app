import { createClient } from "@supabase/supabase-js";
import { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config";
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
}

/** Valida um bearer token e devolve o e-mail da identidade, ou null. */
export type TokenVerifier = (token: string) => Promise<{ email: string } | null>;

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    /** Identidade validada (e-mail) mesmo quando o usuário ainda não existe no banco. */
    identityEmail?: string;
  }
}

// ============================================================================
// Verificador de token (Supabase)
// ============================================================================

/**
 * Valida o JWT localmente (assinatura), sem round-trip ao Supabase a cada request.
 * Usa o segredo HS256 se configurado; caso contrário, o JWKS público do projeto.
 */
export function createSupabaseTokenVerifier(): TokenVerifier | null {
  const url = config.supabaseUrl;
  if (!url) return null;

  const issuer = `${url.replace(/\/+$/, "")}/auth/v1`;
  const secret = config.supabaseJwtSecret;
  const jwks = secret
    ? null
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token) => {
    try {
      const options = { issuer, audience: "authenticated" };
      const { payload } = secret
        ? await jwtVerify(token, new TextEncoder().encode(secret), options)
        : await jwtVerify(token, jwks!, options);
      const email = typeof payload.email === "string" ? payload.email : null;
      return email ? { email: email.toLowerCase() } : null;
    } catch {
      return null;
    }
  };
}

/** Fallback opcional (AUTH_VERIFY_MODE=remote): valida via API do Supabase. */
export function createRemoteTokenVerifier(): TokenVerifier | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    const email = data?.user?.email;
    return error || !email ? null : { email: email.toLowerCase() };
  };
}

let verifier: TokenVerifier | null | undefined;

/** Permite injetar um verificador (testes) sem tocar no Supabase. */
export function setTokenVerifier(custom: TokenVerifier | null | undefined) {
  verifier = custom;
}

function getVerifier(): TokenVerifier | null {
  if (verifier === undefined) {
    verifier =
      process.env.AUTH_VERIFY_MODE === "remote"
        ? createRemoteTokenVerifier()
        : createSupabaseTokenVerifier();
    if (!verifier) {
      console.warn("[Auth] SUPABASE_URL não configurado - autenticação indisponível");
    }
  }
  return verifier;
}

// ============================================================================
// Middlewares
// ============================================================================

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  operationId: true,
} as const;

/** Valida o token e injeta request.identityEmail. Não exige usuário no banco. */
export async function identityMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const verify = getVerifier();
  if (!verify) {
    return reply
      .status(500)
      .send({ error: "Autenticação não configurada no servidor" });
  }

  const token = bearerToken(request);
  if (!token) {
    return reply
      .status(401)
      .send({ error: "Token de autenticação não fornecido" });
  }

  const identity = await verify(token);
  if (!identity) {
    return reply.status(401).send({ error: "Token inválido ou expirado" });
  }

  request.identityEmail = identity.email;
}

/** Exige token válido e usuário cadastrado; injeta request.user. */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await identityMiddleware(request, reply);
  if (reply.sent) return;

  const dbUser = await prisma.user.findUnique({
    where: { email: request.identityEmail! },
    select: userSelect,
  });

  if (!dbUser) {
    return reply.status(403).send({ error: "Usuário não cadastrado no sistema" });
  }

  request.user = dbUser;
}

/** Injeta request.user se houver token válido; nunca bloqueia. */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const verify = getVerifier();
  const token = bearerToken(request);
  if (!verify || !token) return;

  const identity = await verify(token);
  if (!identity) return;

  const dbUser = await prisma.user.findUnique({
    where: { email: identity.email },
    select: userSelect,
  });
  if (dbUser) request.user = dbUser;
}

/** Exige um dos papéis informados (use depois de authMiddleware). */
export function requireRole(...roles: AuthenticatedUser["role"][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Permissão insuficiente" });
    }
  };
}
