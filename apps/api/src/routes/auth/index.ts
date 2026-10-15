import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { config } from "../../config";
import {
  identityMiddleware,
  optionalAuthMiddleware,
} from "../../middleware/auth";

// ============================================================================
// Schemas
// ============================================================================

const signupSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

// ============================================================================
// Routes
// ============================================================================

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /auth/signup
   * Cria o usuário no banco após o login no Supabase.
   * O e-mail vem do token validado (nunca do body), então ninguém cadastra
   * um e-mail que não controla.
   */
  app.post("/signup", { preHandler: identityMiddleware }, async (request, reply) => {
    const body = signupSchema.parse(request.body);
    const email = request.identityEmail!;

    const allowedDomains = config.signupAllowedDomains;
    const domain = email.split("@")[1]?.toLowerCase();
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain ?? "")) {
      return reply.status(403).send({ error: "Domínio de e-mail não autorizado" });
    }

    // Verifica se já existe
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return reply.status(409).send({
        error: "Usuário já cadastrado",
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          role: existing.role,
          operationId: existing.operationId,
        },
      });
    }

    // Cria o usuário
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        role: "ADMIN", // Primeiro usuário é sempre ADMIN
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        operationId: true,
      },
    });

    return reply.status(201).send({ user });
  });

  /**
   * GET /auth/me
   * Retorna informações do usuário autenticado
   */
  app.get("/me", { preHandler: optionalAuthMiddleware }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "Não autenticado" });
    }

    return reply.send({ user: request.user });
  });
}
