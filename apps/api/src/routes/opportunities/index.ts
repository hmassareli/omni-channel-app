import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { authMiddleware } from "../../middleware/auth";

// ============================================================================
// Schemas
// ============================================================================

const opportunityParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const opportunityQuerySchema = z.object({
  stageId: z.uuid().optional(),
  agentId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createOpportunitySchema = z.object({
  companyId: z.uuid("ID da empresa é obrigatório"),
  stageId: z.uuid("ID do estágio é obrigatório"),
  agentId: z.uuid().optional(),
  estimatedValue: z.number().positive().optional(),
  notes: z.string().optional(),
});

const updateOpportunitySchema = z.object({
  stageId: z.uuid().optional(),
  agentId: z.uuid().nullable().optional(),
  estimatedValue: z.number().positive().nullable().optional(),
  notes: z.string().optional().nullable(),
});

// ============================================================================
// Routes
// ============================================================================

export async function opportunitiesRoutes(app: FastifyInstance) {
  /**
   * GET /opportunities
   * Lista oportunidades com filtros
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = opportunityQuerySchema.parse(request.query);

    // Filtra por operation do usuário (via stages)
    const where: Prisma.OpportunityWhereInput = {
      stage: { operationId: user.operationId },
    };

    if (query.stageId) {
      where.stageId = query.stageId;
    }

    if (query.agentId) {
      where.agentId = query.agentId;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              alias: true,
              taxId: true,
            },
          },
          stage: {
            select: { id: true, name: true, color: true, order: true },
          },
          agent: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.opportunity.count({ where }),
    ]);

    return reply.send({
      opportunities,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + opportunities.length < total,
      },
    });
  });

  /**
   * POST /opportunities
   * Cria uma nova oportunidade
   */
  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = createOpportunitySchema.parse(request.body);

    // Verifica se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: body.companyId },
    });

    if (!company) {
      return reply.status(404).send({ error: "Empresa não encontrada" });
    }

    // Verifica se o stage pertence à operação do usuário
    const stage = await prisma.stage.findFirst({
      where: { id: body.stageId, operationId: user.operationId },
    });

    if (!stage) {
      return reply.status(404).send({ error: "Estágio não encontrado" });
    }

    // Se agentId foi fornecido, verifica se pertence à operação
    if (body.agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: body.agentId, operationId: user.operationId },
      });
      if (!agent) {
        return reply.status(404).send({ error: "Atendente não encontrado" });
      }
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        companyId: body.companyId,
        stageId: body.stageId,
        agentId: body.agentId,
        estimatedValue: body.estimatedValue,
        notes: body.notes,
      },
      include: {
        company: {
          select: { id: true, name: true, alias: true, taxId: true },
        },
        stage: {
          select: { id: true, name: true, color: true, order: true },
        },
        agent: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return reply.status(201).send({ opportunity });
  });

  /**
   * GET /opportunities/:id
   * Busca uma oportunidade por ID
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = opportunityParamsSchema.parse(request.params);

    const opportunity = await prisma.opportunity.findFirst({
      where: { id, stage: { operationId: user.operationId } },
      include: {
        company: true,
        stage: true,
        agent: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    if (!opportunity) {
      return reply.status(404).send({ error: "Oportunidade não encontrada" });
    }

    return reply.send({ opportunity });
  });

  /**
   * PUT /opportunities/:id
   * Atualiza uma oportunidade
   */
  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = opportunityParamsSchema.parse(request.params);
    const body = updateOpportunitySchema.parse(request.body);

    const existing = await prisma.opportunity.findFirst({ where: { id, stage: { operationId: user.operationId } } });
    if (!existing) {
      return reply.status(404).send({ error: "Oportunidade não encontrada" });
    }

    // Se stageId foi fornecido, verifica se pertence à operação
    if (body.stageId) {
      const stage = await prisma.stage.findFirst({
        where: { id: body.stageId, operationId: user.operationId },
      });
      if (!stage) {
        return reply.status(404).send({ error: "Estágio não encontrado" });
      }
    }

    // Se agentId foi fornecido (mesmo que null), verifica
    if (body.agentId !== undefined) {
      if (body.agentId !== null) {
        const agent = await prisma.agent.findFirst({
          where: { id: body.agentId, operationId: user.operationId },
        });
        if (!agent) {
          return reply.status(404).send({ error: "Atendente não encontrado" });
        }
      }
    }

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: {
        stageId: body.stageId,
        agentId: body.agentId,
        estimatedValue: body.estimatedValue,
        notes: body.notes,
      },
      include: {
        company: {
          select: { id: true, name: true, alias: true, taxId: true },
        },
        stage: {
          select: { id: true, name: true, color: true, order: true },
        },
        agent: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return reply.send({ opportunity });
  });

  /**
   * DELETE /opportunities/:id
   * Remove uma oportunidade
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = opportunityParamsSchema.parse(request.params);

    const existing = await prisma.opportunity.findFirst({ where: { id, stage: { operationId: user.operationId } } });
    if (!existing) {
      return reply.status(404).send({ error: "Oportunidade não encontrada" });
    }

    await prisma.opportunity.delete({ where: { id } });

    return reply.status(204).send();
  });

  /**
   * GET /opportunities/:id/timeline
   * Retorna a timeline agregada de TODOS os contatos da empresa da oportunidade
   */
  app.get("/:id/timeline", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = opportunityParamsSchema.parse(request.params);

    const opportunity = await prisma.opportunity.findFirst({
      where: { id, stage: { operationId: user.operationId } },
      include: { company: true },
    });

    if (!opportunity) {
      return reply.status(404).send({ error: "Oportunidade não encontrada" });
    }

    const timelineQuery = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const query = timelineQuery.parse(request.query);

    // Busca todos os contatos da empresa
    const contacts = await prisma.contact.findMany({
      where: { companyId: opportunity.companyId },
      select: { id: true, name: true },
    });

    const contactIds = contacts.map(c => c.id);

    const [events, total] = await Promise.all([
      prisma.timelineEvent.findMany({
        where: { contactId: { in: contactIds } },
        include: {
          contact: { select: { id: true, name: true } },
          conversation: {
            select: {
              id: true,
              channel: { select: { id: true, name: true, type: true } },
            },
          },
        },
        orderBy: { occurredAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.timelineEvent.count({ where: { contactId: { in: contactIds } } }),
    ]);

    return reply.send({
      events,
      contacts: contacts,
      company: {
        id: opportunity.company.id,
        name: opportunity.company.name,
      },
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + events.length < total,
      },
    });
  });

  /**
   * PUT /opportunities/:id/move
   * Move a oportunidade para outro estágio
   */
  app.put("/:id/move", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = opportunityParamsSchema.parse(request.params);
    const body = z.object({ stageId: z.uuid("ID do estágio é obrigatório") }).parse(request.body);

    const existing = await prisma.opportunity.findFirst({ where: { id, stage: { operationId: user.operationId } } });
    if (!existing) {
      return reply.status(404).send({ error: "Oportunidade não encontrada" });
    }

    const stage = await prisma.stage.findFirst({
      where: { id: body.stageId, operationId: user.operationId },
    });
    if (!stage) {
      return reply.status(404).send({ error: "Estágio não encontrado" });
    }

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: { stageId: body.stageId },
      include: {
        company: {
          select: { id: true, name: true, alias: true, taxId: true },
        },
        stage: {
          select: { id: true, name: true, color: true, order: true },
        },
        agent: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return reply.send({ opportunity });
  });

  /**
   * GET /opportunities/kanban
   * Retorna oportunidades agrupadas por estágio (para Kanban)
   */
  app.get("/kanban", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;

    // Busca todos os estágios da operação
    const stages = await prisma.stage.findMany({
      where: user.operationId ? { operationId: user.operationId } : { id: "none" },
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, order: true },
    });

    // Para cada estágio, busca as oportunidades
    const kanbanData = await Promise.all(
      stages.map(async (stage) => {
        const opportunities = await prisma.opportunity.findMany({
          where: { stageId: stage.id },
          include: {
            company: {
              select: { id: true, name: true, alias: true, taxId: true },
            },
            agent: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        });

        return {
          stage: stage,
          opportunities,
          count: opportunities.length,
        };
      })
    );

    return reply.send({ kanban: kanbanData });
  });
}
