import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth";
import { getDeskMetrics } from "../../services/desk/metrics";
import { deskHandler } from "../desk-handler";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function metricsRoutes(app: FastifyInstance) {
  /** GET /metrics/desk?from=ISO&to=ISO (ADMIN/MANAGER) */
  app.get(
    "/desk",
    { preHandler: [authMiddleware, requireRole("ADMIN", "MANAGER")] },
    deskHandler(async (actor, request) => {
      const range = querySchema.parse(request.query);
      return getDeskMetrics(actor.operationId, range);
    }),
  );
}
