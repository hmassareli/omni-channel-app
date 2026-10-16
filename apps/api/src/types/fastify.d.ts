import type { PrismaClientInstance } from "../prisma";
import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClientInstance;
  }
}
