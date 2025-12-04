import cors from "@fastify/cors";
import dotenv from "dotenv";
import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
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

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(cors, {
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
app.register(registerWhatsappWebhookRoutes, { prefix: "/webhooks" });

// Rotas de entidades
app.register(operationsRoutes, { prefix: "/operations" });
app.register(channelsRoutes, { prefix: "/channels" });
app.register(usersRoutes, { prefix: "/users" });
app.register(agentsRoutes, { prefix: "/agents" });
app.register(tagsRoutes, { prefix: "/tags" });
app.register(stagesRoutes, { prefix: "/stages" });
app.register(contactsRoutes, { prefix: "/contacts" });
app.register(conversationsRoutes, { prefix: "/conversations" });

const start = async () => {
  try {
    await app.listen({ port: 3333 });
    console.log("HTTP server running on http://localhost:3333");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
