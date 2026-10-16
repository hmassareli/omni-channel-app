import { FastifyInstance } from "fastify";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "../../auth/password";
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from "../../auth/sessions";
import { signAccessToken } from "../../auth/tokens";
import { authMiddleware, authUserSelect } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`),
  refreshToken: z.string().optional(), // sessão atual, mantida ao trocar a senha
});

/** Limite de tentativas por IP + e-mail (o body já está parseado no preHandler). */
const loginRateLimit = {
  max: 10,
  timeWindow: "1 minute",
  hook: "preHandler" as const,
  keyGenerator: (request: { ip: string; body?: unknown }) => {
    const email = (request.body as { email?: unknown } | undefined)?.email;
    return `${request.ip}:${typeof email === "string" ? email.trim().toLowerCase() : ""}`;
  },
};

// Mesmo custo de verificação quando o e-mail não existe (evita enumeração por tempo)
const DUMMY_HASH = hashPassword("senha-inexistente");

async function issueTokens(user: { id: string; email: string }, userAgent?: string) {
  const [{ token, expiresIn }, refreshToken] = await Promise.all([
    signAccessToken(user),
    createSession(user.id, userAgent),
  ]);
  return { accessToken: token, expiresIn, refreshToken };
}

// ============================================================================
// Routes
// ============================================================================

export async function authRoutes(app: FastifyInstance) {
  /** POST /auth/login - e-mail e senha */
  app.post(
    "/login",
    { config: { rateLimit: loginRateLimit } },
    async (request, reply) => {
      const { email, password } = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...authUserSelect, passwordHash: true },
      });

      const valid = user?.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : (await verifyPassword(password, await DUMMY_HASH), false);

      if (!user || !valid) {
        return reply.status(401).send({ error: "E-mail ou senha incorretos" });
      }

      const { passwordHash: _, ...publicUser } = user;
      const tokens = await issueTokens(user, request.headers["user-agent"]);
      return reply.send({ user: publicUser, ...tokens });
    },
  );

  /** POST /auth/refresh - troca o refresh token (rotação) */
  app.post(
    "/refresh",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse(request.body);
      const rotated = await rotateSession(refreshToken, request.headers["user-agent"]);
      if (!rotated) {
        return reply.status(401).send({ error: "Sessão expirada. Entre novamente." });
      }
      const { token, expiresIn } = await signAccessToken(rotated.user);
      return reply.send({ accessToken: token, expiresIn, refreshToken: rotated.refreshToken });
    },
  );

  /** POST /auth/logout - encerra a sessão atual */
  app.post("/logout", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (parsed.success) await revokeSession(parsed.data.refreshToken);
    return reply.status(204).send();
  });

  /** GET /auth/me - usuário autenticado */
  app.get("/me", { preHandler: authMiddleware }, async (request, reply) => {
    return reply.send({ user: request.user });
  });

  /** POST /auth/change-password - troca a senha e encerra as outras sessões */
  app.post(
    "/change-password",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: request.user!.id },
        select: { passwordHash: true },
      });

      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        return reply.status(400).send({ error: "Senha atual incorreta" });
      }

      await prisma.user.update({
        where: { id: request.user!.id },
        data: {
          passwordHash: await hashPassword(body.newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
      await revokeAllSessions(request.user!.id, body.refreshToken);

      return reply.status(204).send();
    },
  );
}
