import { UserRole } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateTemporaryPassword, hashPassword } from "../../auth/password";
import { revokeAllSessions } from "../../auth/sessions";
import { authMiddleware, requireRole } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const createUserSchema = z.object({
  email: z.email("Email inválido").transform((e) => e.trim().toLowerCase()),
  name: z.string().min(1, "Nome é obrigatório"),
  role: z.enum(UserRole).default(UserRole.AGENT),
  operationId: z.string().optional(),
  /** Atendente existente (sem usuário) a vincular; sem ele, cria um novo. */
  agentId: z.uuid().optional(),
});

const updateUserSchema = z.object({
  email: z.email("Email inválido").transform((e) => e.trim().toLowerCase()).optional(),
  name: z.string().min(1).optional(),
  role: z.enum(UserRole).optional(),
  operationId: z.string().nullable().optional(),
});

const manage = [authMiddleware, requireRole("ADMIN", "MANAGER")];

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
  app.post("/", { preHandler: manage }, async (request, reply) => {
    const requester = request.user!;
    const body = createUserSchema.parse(request.body);

    if (!requester.operationId) {
      return reply
        .status(400)
        .send({ error: "Usuário sem operação vinculada" });
    }

    if (body.role === UserRole.ADMIN && requester.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: "Só um ADMIN pode criar outro ADMIN" });
    }

    // Verifica se email já existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingEmail) {
      return reply.status(409).send({ error: "Email já cadastrado" });
    }

    if (body.agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: body.agentId, operationId: requester.operationId, userId: null },
      });
      if (!agent) {
        return reply.status(404).send({ error: "Atendente não encontrado ou já vinculado" });
      }
    }

    // Convite: senha provisória mostrada uma única vez; troca obrigatória no 1º acesso.
    // Todo usuário vira também atendente (pode assumir conversas no inbox).
    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        operationId: requester.operationId,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        agent: body.agentId
          ? { connect: { id: body.agentId } }
          : { create: { name: body.name, operationId: requester.operationId } },
      },
      include: {
        operation: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send({ user, temporaryPassword });
  });

  /**
   * PUT /users/:id
   * Atualiza um usuário
   */
  app.put("/:id", { preHandler: manage }, async (request, reply) => {
    const requester = request.user!;
    const { id } = userParamsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    const existing = await prisma.user.findFirst({
      where: { id, operationId: requester.operationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    const touchesAdmin = body.role === UserRole.ADMIN || existing.role === UserRole.ADMIN;
    if (touchesAdmin && requester.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: "Só um ADMIN pode alterar um ADMIN" });
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
   * POST /users/:id/reset-password
   * Gera uma nova senha provisória e encerra as sessões do usuário
   */
  app.post("/:id/reset-password", { preHandler: manage }, async (request, reply) => {
    const requester = request.user!;
    const { id } = userParamsSchema.parse(request.params);

    const existing = await prisma.user.findFirst({
      where: { id, operationId: requester.operationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }
    if (existing.role === UserRole.ADMIN && requester.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: "Só um ADMIN pode redefinir a senha de um ADMIN" });
    }

    const temporaryPassword = generateTemporaryPassword();
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await revokeAllSessions(id);

    return reply.send({ temporaryPassword });
  });

  /**
   * DELETE /users/:id
   * Remove um usuário
   */
  app.delete("/:id", { preHandler: manage }, async (request, reply) => {
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
