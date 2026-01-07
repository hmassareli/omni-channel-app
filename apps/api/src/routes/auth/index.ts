import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { optionalAuthMiddleware } from "../../middleware/auth";

// ============================================================================
// Schemas
// ============================================================================

// Lista de domínios de email descartáveis comuns
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email',
  'mailinator.com', 'sharklasers.com', 'guerrillamail.info', 'yopmail.com'
];

const signupSchema = z.object({
  email: z.string()
    .email("Email inválido")
    .refine(
      (email) => {
        const domain = email.split('@')[1]?.toLowerCase();
        return domain && !DISPOSABLE_EMAIL_DOMAINS.includes(domain);
      },
      { message: "Email descartável não permitido" }
    ),
  name: z.string().min(1, "Nome é obrigatório"),
});

// ============================================================================
// Routes
// ============================================================================

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /auth/signup
   * Cria um usuário no banco (chamado após signup no Supabase)
   * Rota PÚBLICA - não requer autenticação
   */
  app.post("/signup", async (request, reply) => {
    const body = signupSchema.parse(request.body);

    // Verifica se já existe
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
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
        email: body.email,
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
