import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth";
import {
  createQueue,
  deleteQueue,
  listQueues,
  setQueueMembers,
  updateQueue,
} from "../../services/desk/queues";
import { deskHandler } from "../desk-handler";

const paramsSchema = z.object({ id: z.uuid("ID inválido") });
const bodySchema = z.object({ name: z.string().trim().min(1, "Nome é obrigatório").max(100) });
const membersSchema = z.object({ agentIds: z.array(z.uuid()) });

const manage = [authMiddleware, requireRole("ADMIN", "MANAGER")];

export async function queuesRoutes(app: FastifyInstance) {
  /** GET /queues - qualquer papel autenticado (usado em filtros). */
  app.get(
    "/",
    { preHandler: authMiddleware },
    deskHandler(async (actor) => ({ queues: await listQueues(actor.operationId) })),
  );

  /** POST /queues */
  app.post(
    "/",
    { preHandler: manage },
    deskHandler(async (actor, request, reply) => {
      const { name } = bodySchema.parse(request.body);
      const queue = await createQueue(actor.operationId, name);
      return reply.status(201).send({ queue });
    }),
  );

  /** PUT /queues/:id */
  app.put(
    "/:id",
    { preHandler: manage },
    deskHandler(async (actor, request) => {
      const { id } = paramsSchema.parse(request.params);
      const { name } = bodySchema.parse(request.body);
      return { queue: await updateQueue(actor.operationId, id, name) };
    }),
  );

  /** DELETE /queues/:id */
  app.delete(
    "/:id",
    { preHandler: manage },
    deskHandler(async (actor, request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      await deleteQueue(actor.operationId, id);
      return reply.status(204).send();
    }),
  );

  /** PUT /queues/:id/members */
  app.put(
    "/:id/members",
    { preHandler: manage },
    deskHandler(async (actor, request) => {
      const { id } = paramsSchema.parse(request.params);
      const { agentIds } = membersSchema.parse(request.body);
      return { queue: await setQueueMembers(actor.operationId, id, agentIds) };
    }),
  );
}
