import { FastifyReply, FastifyRequest } from "fastify";
import { DeskActor, DeskError, resolveActor } from "../services/desk/access";

/**
 * Envolve um handler da mesa: resolve o ator (usuário + agente) e converte
 * DeskError em resposta HTTP `{ error }`.
 */
export function deskHandler(
  fn: (
    actor: DeskActor,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const actor = await resolveActor(request.user!);
      return await fn(actor, request, reply);
    } catch (error) {
      if (error instanceof DeskError) {
        return reply.status(error.status).send({ error: error.message });
      }
      throw error;
    }
  };
}
