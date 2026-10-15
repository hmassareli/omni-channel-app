import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { registerAllChannels } from "./channels";
import { config } from "./config";
import { TokenVerifier, setTokenVerifier } from "./middleware/auth";
import { eventsRoutes } from "./events/sse";
import { stopJobs } from "./jobs/boss";
import { startJobs } from "./jobs/workers";
import { prisma } from "./prisma";

// Routes
import { agentsRoutes } from "./routes/agents";
import { authRoutes } from "./routes/auth";
import { channelsRoutes } from "./routes/channels";
import { companiesRoutes } from "./routes/companies";
import { contactsRoutes } from "./routes/contacts";
import { conversationsRoutes } from "./routes/conversations";
import { metricsRoutes } from "./routes/metrics";
import { operationsRoutes } from "./routes/operations";
import { opportunitiesRoutes } from "./routes/opportunities";
import { queuesRoutes } from "./routes/queues";
import { stagesRoutes } from "./routes/stages";
import { tagsRoutes } from "./routes/tags";
import { usersRoutes } from "./routes/users";
import { registerWhatsappWebhookRoutes } from "./routes/webhooks/whatsapp";

/**
 * Cria e configura a instância do Fastify.
 * Exportado para ser usado nos testes.
 */
export interface BuildAppOptions {
  /** Substitui a validação de token (testes). */
  tokenVerifier?: TokenVerifier;
}

export async function buildApp(options: BuildAppOptions = {}) {
  if (options.tokenVerifier) setTokenVerifier(options.tokenVerifier);

  const app = fastify({ logger: process.env.NODE_ENV !== "test" }).withTypeProvider<ZodTypeProvider>();

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
    // CORS_ORIGINS="https://app.exemplo.com,http://localhost:5173"
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: "Muitas requisições. Tente novamente em alguns minutos.",
      statusCode: 429,
    }),
  });

  registerAllChannels();

  app.decorate("prisma", prisma);

  app.addHook("onClose", async (instance) => {
    await stopJobs();
    await instance.prisma.$disconnect();
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Rotas de webhook (WAHA, etc)
  await app.register(registerWhatsappWebhookRoutes, { prefix: "/webhooks" });

  // Rotas de autenticação (públicas)
  await app.register(authRoutes, { prefix: "/auth" });

  // Rotas de entidades
  await app.register(operationsRoutes, { prefix: "/operations" });
  await app.register(channelsRoutes, { prefix: "/channels" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(agentsRoutes, { prefix: "/agents" });
  await app.register(tagsRoutes, { prefix: "/tags" });
  await app.register(stagesRoutes, { prefix: "/stages" });
  await app.register(contactsRoutes, { prefix: "/contacts" });
  await app.register(conversationsRoutes, { prefix: "/conversations" });
  await app.register(companiesRoutes, { prefix: "/companies" });
  await app.register(opportunitiesRoutes, { prefix: "/opportunities" });
  await app.register(queuesRoutes, { prefix: "/queues" });
  await app.register(metricsRoutes, { prefix: "/metrics" });
  await app.register(eventsRoutes, { prefix: "/events" });

  return app;
}

// Só inicia o servidor se executado diretamente (não em testes)
if (require.main === module) {
  buildApp().then((app) => {
    app.listen({ port: 3333, host: "0.0.0.0" }).then(async () => {
      await startJobs();
      console.log("HTTP server running on http://localhost:3333");
    });
  });
}
