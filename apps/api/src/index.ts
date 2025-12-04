import cors from "@fastify/cors";
import dotenv from "dotenv";
import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { prisma } from "./prisma";

// Routes
import { agentsRoutes } from "./routes/agents";
import { channelsRoutes } from "./routes/channels";
import { contactsRoutes } from "./routes/contacts";
import { conversationsRoutes } from "./routes/conversations";
import { operationsRoutes } from "./routes/operations";
import { stagesRoutes } from "./routes/stages";
import { tagsRoutes } from "./routes/tags";
import { usersRoutes } from "./routes/users";
import { registerWhatsappWebhookRoutes } from "./routes/webhooks/whatsapp";

dotenv.config();

/**
 * Cria e configura a instância do Fastify.
 * Exportado para ser usado nos testes.
 */
export async function buildApp() {
  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Error handler global para erros de validação Zod
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Erro de validação",
        details: error.issues,
      });
    }
    // Re-throw para o handler padrão
    reply.send(error);
  });

  await app.register(cors, {
    origin: "*", // Em produção, mude para a URL do seu frontend
  });

  app.decorate("prisma", prisma);

  app.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });

  app.get("/", async () => {
    return { message: "Hello from Omni API" };
  });

  // Rotas de webhook (WAHA, etc)
  await app.register(registerWhatsappWebhookRoutes, { prefix: "/webhooks" });

  // Rotas de entidades
  await app.register(operationsRoutes, { prefix: "/operations" });
  await app.register(channelsRoutes, { prefix: "/channels" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(agentsRoutes, { prefix: "/agents" });
  await app.register(tagsRoutes, { prefix: "/tags" });
  await app.register(stagesRoutes, { prefix: "/stages" });
  await app.register(contactsRoutes, { prefix: "/contacts" });
  await app.register(conversationsRoutes, { prefix: "/conversations" });

  return app;
}

// Só inicia o servidor se executado diretamente (não em testes)
if (require.main === module) {
  buildApp().then((app) => {
    app.listen({ port: 3333 }).then(() => {
      console.log("HTTP server running on http://localhost:3333");
    });
  });
}
