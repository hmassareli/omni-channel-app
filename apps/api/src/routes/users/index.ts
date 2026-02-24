import { UserRole } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const createUserSchema = z.object({
  email: z.email("Email inválido"),
  name: z.string().min(1, "Nome é obrigatório"),
  role: z.enum(UserRole).default(UserRole.AGENT),
  operationId: z.string().optional(),
});

const updateUserSchema = z.object({
  email: z.email("Email inválido").optional(),
  name: z.string().min(1).optional(),
  role: z.enum(UserRole).optional(),
  operationId: z.string().nullable().optional(),
});

const userParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const userQuerySchema = z.object({
  operationId: z.string().optional(),
  role: z.enum(UserRole).optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function usersRoutes(app: FastifyInstance) {
  /**
   * GET /users
   * Lista todos os usuários da mesma operation
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = userQuerySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        operationId: user.operationId, // Sempre filtra pela operation do usuário
        role: query.role,
      },
      include: {
        operation: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ users });
  });

  /**
   * GET /users/:id
   * Busca um usuário por ID
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const requester = request.user!;
    const { id } = userParamsSchema.parse(request.params);

    const user = await prisma.user.findFirst({
      where: { id, operationId: requester.operationId },
      include: {
        operation: { select: { id: true, name: true } },
        agent: {
          include: {
            channels: {
              select: { id: true, name: true, type: true, status: true },
            },
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    return reply.send({ user });
  });

  /**
   * POST /users
   * Cria um novo usuário
   */
  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const requester = request.user!;
    const body = createUserSchema.parse(request.body);

    if (!requester.operationId) {
      return reply
        .status(400)
        .send({ error: "Usuário sem operação vinculada" });
    }

    // Verifica se email já existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingEmail) {
      return reply.status(409).send({ error: "Email já cadastrado" });
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        operationId: requester.operationId,
      },
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send({ user });
  });

  /**
   * PUT /users/:id
   * Atualiza um usuário
   */
  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const requester = request.user!;
    const { id } = userParamsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    const existing = await prisma.user.findFirst({
      where: { id, operationId: requester.operationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    // Verifica se email já existe (se estiver alterando)
    if (body.email && body.email !== existing.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existingEmail) {
        return reply.status(409).send({ error: "Email já cadastrado" });
      }
    }

    // Remove operationId do body para evitar troca de operação
    const { operationId: _ignore, ...safeBody } = body;

    const user = await prisma.user.update({
      where: { id },
      data: safeBody,
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.send({ user });
  });

  /**
   * DELETE /users/:id
   * Remove um usuário
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const requester = request.user!;
    const { id } = userParamsSchema.parse(request.params);

    const existing = await prisma.user.findFirst({
      where: { id, operationId: requester.operationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    await prisma.user.delete({ where: { id } });

    return reply.status(204).send();
  });
}
