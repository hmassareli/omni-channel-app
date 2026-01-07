import { UserRole } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware } from "../../middleware/auth";

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
  app.get("/:id", async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);

    const user = await prisma.user.findUnique({
      where: { id },
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
  app.post("/", async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Verifica se email já existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingEmail) {
      return reply.status(409).send({ error: "Email já cadastrado" });
    }

    // Verifica se operation existe (se fornecida)
    if (body.operationId) {
      const operation = await prisma.operation.findUnique({
        where: { id: body.operationId },
      });
      if (!operation) {
        return reply.status(404).send({ error: "Operation não encontrada" });
      }
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        operationId: body.operationId,
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
  app.put("/:id", async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { id } });
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

    const user = await prisma.user.update({
      where: { id },
      data: body,
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
  app.delete("/:id", async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    await prisma.user.delete({ where: { id } });

    return reply.status(204).send();
  });
}
