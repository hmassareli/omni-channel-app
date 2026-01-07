import { FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../prisma";

// ============================================================================
// Supabase Client para validar tokens
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Auth] SUPABASE_URL ou SUPABASE_ANON_KEY não configurados - autenticação desabilitada"
  );
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

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

// Estende o tipo do Fastify Request para incluir user
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// ============================================================================
// Middleware de Autenticação
// ============================================================================

/**
 * Middleware que valida o token JWT do Supabase e injeta o usuário no request
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!supabase) {
    return reply.status(500).send({
      error: "Autenticação não configurada no servidor",
    });
  }

  // Extrai o token do header Authorization
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: "Token de autenticação não fornecido",
    });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    // Valida o token com o Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("[Auth] Erro ao validar token:", error);
      return reply.status(401).send({
        error: "Token inválido ou expirado",
      });
    }

    if (!data.user) {
      console.error("[Auth] Token válido mas sem usuário");
      return reply.status(401).send({
        error: "Token inválido ou expirado",
      });
    }

    const email = data.user.email;

    if (!email) {
      console.error("[Auth] Usuário sem email");
      return reply.status(401).send({
        error: "Usuário sem email",
      });
    }

    // Busca o usuário no banco de dados
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        operationId: true,
      },
    });

    if (!dbUser) {
      return reply.status(403).send({
        error: "Usuário não cadastrado no sistema",
      });
    }

    // Injeta o usuário autenticado no request
    request.user = dbUser;
  } catch (error) {
    console.error("[Auth] Erro ao validar token:", error);
    return reply.status(401).send({
      error: "Erro ao validar autenticação",
    });
  }
}

/**
 * Middleware opcional - permite acesso sem autenticação mas injeta user se tiver token
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  if (!supabase) {
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return; // Sem token, continua sem user
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user || !data.user.email) {
      return; // Token inválido, continua sem user
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: data.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        operationId: true,
      },
    });

    if (dbUser) {
      request.user = dbUser;
    }
  } catch {
    // Ignora erros no middleware opcional
  }
}
