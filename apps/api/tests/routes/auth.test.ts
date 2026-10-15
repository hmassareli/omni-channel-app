import { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { authHeader, createAuthedUser } from "../helpers/auth";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Auth Routes", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  const originalDomains = process.env.SIGNUP_ALLOWED_DOMAINS;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  afterEach(() => {
    if (originalDomains === undefined) delete process.env.SIGNUP_ALLOWED_DOMAINS;
    else process.env.SIGNUP_ALLOWED_DOMAINS = originalDomains;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe("POST /auth/signup", () => {
    it("exige token (401)", async () => {
      expect((await http.post("/auth/signup", {}, { name: "X" })).statusCode).toBe(401);
      expect(await prisma.user.count()).toBe(0);
    });

    it("cria o usuário como ADMIN usando o e-mail do token", async () => {
      const res = await http.post("/auth/signup", authHeader("novo@empresa.com"), { name: "Novo" });
      expect(res.statusCode).toBe(201);
      expect(res.json().user).toMatchObject({
        email: "novo@empresa.com",
        name: "Novo",
        role: "ADMIN",
        operationId: null,
      });
      expect(await prisma.user.findUnique({ where: { email: "novo@empresa.com" } })).not.toBeNull();
    });

    it("ignora e-mail enviado no body (vem sempre do token)", async () => {
      const res = await http.post("/auth/signup", authHeader("real@empresa.com"), {
        name: "Real",
        email: "vitima@empresa.com",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().user.email).toBe("real@empresa.com");
      expect(await prisma.user.findUnique({ where: { email: "vitima@empresa.com" } })).toBeNull();
    });

    it("400 sem nome", async () => {
      const res = await http.post("/auth/signup", authHeader("semnome@empresa.com"), {});
      expect(res.statusCode).toBe(400);
    });

    it("409 se o usuário já existe, devolvendo o cadastro existente", async () => {
      const existing = await createAuthedUser({ role: "MANAGER", name: "Existente" });
      const res = await http.post("/auth/signup", existing.headers, { name: "Outro Nome" });
      expect(res.statusCode).toBe(409);
      expect(res.json().user).toMatchObject({ id: existing.user.id, name: "Existente", role: "MANAGER" });
      expect((await prisma.user.findUnique({ where: { id: existing.user.id } }))?.name).toBe("Existente");
    });

    describe("SIGNUP_ALLOWED_DOMAINS", () => {
      it("403 para domínio fora da lista", async () => {
        process.env.SIGNUP_ALLOWED_DOMAINS = "empresa.com, parceira.com";
        const res = await http.post("/auth/signup", authHeader("intruso@gmail.com"), { name: "I" });
        expect(res.statusCode).toBe(403);
        expect(await prisma.user.findUnique({ where: { email: "intruso@gmail.com" } })).toBeNull();
      });

      it("201 para domínio da lista (sem diferenciar maiúsculas)", async () => {
        process.env.SIGNUP_ALLOWED_DOMAINS = "Empresa.com,parceira.com";
        const res = await http.post("/auth/signup", authHeader("ok@parceira.com"), { name: "Ok" });
        expect(res.statusCode).toBe(201);
        const res2 = await http.post("/auth/signup", authHeader("ok2@EMPRESA.com"), { name: "Ok2" });
        expect(res2.statusCode).toBe(201);
      });

      it("vazio = qualquer domínio", async () => {
        process.env.SIGNUP_ALLOWED_DOMAINS = "";
        const res = await http.post("/auth/signup", authHeader("qualquer@qualquer.org"), { name: "Q" });
        expect(res.statusCode).toBe(201);
      });
    });
  });

  describe("GET /auth/me", () => {
    it("401 sem token", async () => {
      expect((await http.get("/auth/me")).statusCode).toBe(401);
    });

    it("401 para token de e-mail sem cadastro", async () => {
      expect((await http.get("/auth/me", authHeader("fantasma@test.com"))).statusCode).toBe(401);
    });

    it("retorna o usuário autenticado", async () => {
      const u = await createAuthedUser({ role: "MANAGER" });
      const res = await http.get("/auth/me", u.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({
        id: u.user.id,
        email: u.email,
        role: "MANAGER",
        operationId: u.operationId,
      });
    });
  });
});
