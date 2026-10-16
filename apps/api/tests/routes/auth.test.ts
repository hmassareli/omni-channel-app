import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password";
import { setTokenVerifier } from "../../src/middleware/auth";
import { prisma } from "../../src/prisma";
import { testTokenVerifier } from "../helpers/auth";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

/** Autenticação própria: aqui usamos o verificador JWT real, não o de teste. */
describe("Auth Routes", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  let seq = 0;

  beforeAll(async () => {
    app = await getTestApp();
    setTokenVerifier(undefined);
    http = client(app);
  });

  afterAll(async () => {
    setTokenVerifier(testTokenVerifier);
    await closeTestApp();
  });

  async function createUser(
    opts: {
      password?: string;
      mustChange?: boolean;
      role?: "ADMIN" | "MANAGER" | "AGENT";
      operationId?: string;
    } = {},
  ) {
    const operationId =
      opts.operationId ?? (await prisma.operation.create({ data: { name: "Op auth" } })).id;
    return prisma.user.create({
      data: {
        email: `usuario${++seq}-${Date.now()}@empresa.com`,
        name: "Usuária",
        role: opts.role ?? "ADMIN",
        operationId,
        passwordHash: opts.password ? await hashPassword(opts.password) : null,
        mustChangePassword: opts.mustChange ?? false,
      },
    });
  }

  const login = (email: string, password: string) =>
    http.post("/auth/login", {}, { email, password });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  describe("senha", () => {
    it("hash scrypt verifica a senha certa e recusa a errada", async () => {
      const hash = await hashPassword("segredo-forte");
      expect(hash.startsWith("scrypt$")).toBe(true);
      expect(await verifyPassword("segredo-forte", hash)).toBe(true);
      expect(await verifyPassword("outra", hash)).toBe(false);
      expect(await verifyPassword("x", null)).toBe(false);
    });
  });

  describe("POST /auth/login", () => {
    it("entra com e-mail (sem diferenciar maiúsculas) e senha, sem expor o hash", async () => {
      const user = await createUser({ password: "senha-123" });
      const res = await login(user.email.toUpperCase(), "senha-123");
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.user).toMatchObject({ id: user.id, email: user.email, role: "ADMIN" });
      expect(body.user.passwordHash).toBeUndefined();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();

      const me = await http.get("/auth/me", bearer(body.accessToken));
      expect(me.statusCode).toBe(200);
      expect(me.json().user.email).toBe(user.email);
    });

    it("401 com senha errada, e-mail inexistente ou usuário sem senha", async () => {
      const user = await createUser({ password: "senha-123" });
      const semSenha = await createUser();
      expect((await login(user.email, "errada")).statusCode).toBe(401);
      expect((await login("ninguem@empresa.com", "senha-123")).statusCode).toBe(401);
      expect((await login(semSenha.email, "qualquer")).statusCode).toBe(401);
    });

    it("rotas protegidas recusam token adulterado ou ausente", async () => {
      const user = await createUser({ password: "senha-123" });
      const { accessToken } = (await login(user.email, "senha-123")).json();
      const [head, payload] = accessToken.split(".");
      const forged = `${head}.${payload}.assinatura-falsa`;

      expect((await http.get("/tags")).statusCode).toBe(401);
      expect((await http.get("/tags", bearer(forged))).statusCode).toBe(401);
      expect((await http.get("/tags", bearer(accessToken))).statusCode).toBe(200);
    });

    it("limita tentativas por e-mail (429) sem bloquear outros e-mails", async () => {
      const user = await createUser({ password: "senha-123" });
      const outro = await createUser({ password: "senha-123" });
      for (let i = 0; i < 10; i++) await login(user.email, "errada");
      expect((await login(user.email, "senha-123")).statusCode).toBe(429);
      expect((await login(outro.email, "senha-123")).statusCode).toBe(200);
    });

    it("listagem de usuários não devolve passwordHash", async () => {
      const user = await createUser({ password: "senha-123" });
      const { accessToken } = (await login(user.email, "senha-123")).json();
      const res = await http.get("/users", bearer(accessToken));
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain("passwordHash");
    });
  });

  describe("refresh e logout", () => {
    it("rotaciona o refresh token; reusar o antigo revoga todas as sessões", async () => {
      const user = await createUser({ password: "senha-123" });
      const first = (await login(user.email, "senha-123")).json();

      const r1 = await http.post("/auth/refresh", {}, { refreshToken: first.refreshToken });
      expect(r1.statusCode).toBe(200);
      const second = r1.json();
      expect(second.accessToken).toBeTruthy();
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const reuse = await http.post("/auth/refresh", {}, { refreshToken: first.refreshToken });
      expect(reuse.statusCode).toBe(401);
      const afterReuse = await http.post("/auth/refresh", {}, { refreshToken: second.refreshToken });
      expect(afterReuse.statusCode).toBe(401);
    });

    it("logout revoga a sessão", async () => {
      const user = await createUser({ password: "senha-123" });
      const { refreshToken } = (await login(user.email, "senha-123")).json();
      expect((await http.post("/auth/logout", {}, { refreshToken })).statusCode).toBe(204);
      expect((await http.post("/auth/refresh", {}, { refreshToken })).statusCode).toBe(401);
    });
  });

  describe("senha provisória e troca", () => {
    it("com senha provisória só /auth/* funciona até trocar", async () => {
      const user = await createUser({ password: "provisoria-1", mustChange: true });
      const { accessToken, refreshToken } = (await login(user.email, "provisoria-1")).json();
      const auth = bearer(accessToken);

      const blocked = await http.get("/tags", auth);
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().code).toBe("PASSWORD_CHANGE_REQUIRED");
      expect((await http.get("/auth/me", auth)).json().user.mustChangePassword).toBe(true);

      const wrong = await http.post("/auth/change-password", auth, {
        currentPassword: "errada",
        newPassword: "nova-senha-1",
      });
      expect(wrong.statusCode).toBe(400);
      const short = await http.post("/auth/change-password", auth, {
        currentPassword: "provisoria-1",
        newPassword: "curta",
      });
      expect(short.statusCode).toBe(400);
      const ok = await http.post("/auth/change-password", auth, {
        currentPassword: "provisoria-1",
        newPassword: "nova-senha-1",
        refreshToken,
      });
      expect(ok.statusCode).toBe(204);

      expect((await http.get("/tags", auth)).statusCode).toBe(200);
      expect((await login(user.email, "provisoria-1")).statusCode).toBe(401);
      expect((await login(user.email, "nova-senha-1")).statusCode).toBe(200);
      // a sessão em uso continua valendo depois da troca
      expect((await http.post("/auth/refresh", {}, { refreshToken })).statusCode).toBe(200);
    });
  });

  describe("convite e redefinição pelo admin", () => {
    it("POST /users gera senha provisória; reset-password gera outra e derruba sessões", async () => {
      const admin = await createUser({ password: "admin-123" });
      const auth = bearer((await login(admin.email, "admin-123")).json().accessToken);

      const created = await http.post("/users", auth, {
        email: "Nova@Empresa.com",
        name: "Nova",
        role: "AGENT",
      });
      expect(created.statusCode).toBe(201);
      const { user, temporaryPassword } = created.json();
      expect(user.email).toBe("nova@empresa.com");
      expect(user.passwordHash).toBeUndefined();
      expect(user.agent).toMatchObject({ name: "Nova" }); // já pode atender

      const first = await login("nova@empresa.com", temporaryPassword);
      expect(first.statusCode).toBe(200);
      expect(first.json().user.mustChangePassword).toBe(true);

      const reset = await http.post(`/users/${user.id}/reset-password`, auth);
      expect(reset.statusCode).toBe(200);
      const oldSession = await http.post("/auth/refresh", {}, { refreshToken: first.json().refreshToken });
      expect(oldSession.statusCode).toBe(401);
      expect((await login("nova@empresa.com", temporaryPassword)).statusCode).toBe(401);
      expect((await login("nova@empresa.com", reset.json().temporaryPassword)).statusCode).toBe(200);
    });

    it("MANAGER não cria, não promove e não redefine ADMIN", async () => {
      const admin = await createUser({ password: "admin-123" });
      const manager = await createUser({
        password: "gerente-123",
        role: "MANAGER",
        operationId: admin.operationId!,
      });
      const auth = bearer((await login(manager.email, "gerente-123")).json().accessToken);

      const create = await http.post("/users", auth, { email: "x@empresa.com", name: "X", role: "ADMIN" });
      expect(create.statusCode).toBe(403);
      expect((await http.put(`/users/${manager.id}`, auth, { role: "ADMIN" })).statusCode).toBe(403);
      expect((await http.post(`/users/${admin.id}/reset-password`, auth)).statusCode).toBe(403);
    });
  });
});
