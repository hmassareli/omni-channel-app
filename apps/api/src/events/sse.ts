import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { onDeskEvent } from "./bus";

const HEARTBEAT_MS = 25_000;

/**
 * GET /events - Server-Sent Events autenticado (Authorization: Bearer).
 * Entrega apenas eventos da operação do usuário.
 */
export async function eventsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const operationId = request.user!.operationId;
    if (!operationId) {
      return reply.status(403).send({ error: "Usuário sem operação vinculada" });
    }

    // Assume o controle da resposta (stream aberto).
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      // Mantém os headers já definidos (ex.: CORS do plugin), pois hijack() os ignora.
      ...(reply.getHeaders() as Record<string, string>),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n: connected\n\n");

    const unsubscribe = onDeskEvent((event) => {
      if (event.operationId !== operationId) return;
      const { type, operationId: _op, ...data } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    });

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on("close", cleanup);
    res.on("close", cleanup);
  });
}
