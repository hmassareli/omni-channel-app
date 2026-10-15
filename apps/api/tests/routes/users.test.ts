import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Users Routes", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe("autenticação", () => {
    it("exige token em todas as rotas", async () => {
      expect((await http.get("/users")).statusCode).toBe(401);
      expect((await http.get(`/users/${NIL_UUID}`)).statusCode).toBe(401);
      expect((await http.post("/users", {}, { email: "a@b.com", name: "x" })).statusCode).toBe(401);
      expect((await http.put(`/users/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
      expect((await http.del(`/users/${NIL_UUID}`)).statusCode).toBe(401);
    });

    it("token inválido (verificador devolve null) => 401", async () => {
      // O verificador de teste aceita qualquer token; sem prefixo Bearer não há token.
      const res = await http.get("/users", { authorization: "Basic abc" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /users", () => {
    it("lista só usuários da própria operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId, name: "Colega" });
      const outro = await createAuthedUser({ name: "Outro" });

      const res = await http.get("/users", a.headers);
      expect(res.statusCode).toBe(200);
      const ids = res.json().users.map((u: { id: string }) => u.id);
      expect(ids).toContain(a.user.id);
      expect(ids).toContain(colega.user.id);
      expect(ids).not.toContain(outro.user.id);
    });

    it("filtra por role", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      await createAuthedUser({ operationId: a.operationId, role: "MANAGER" });
      await createAuthedUser({ operationId: a.operationId, role: "AGENT" });

      const res = await http.get("/users?role=MANAGER", a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().users).toHaveLength(1);
      expect(res.json().users[0].role).toBe("MANAGER");
    });

    it("usuário sem operação recebe lista vazia", async () => {
      const u = await prisma.user.create({ data: { email: "orfao@test.com", name: "Órfão" } });
      const res = await http.get("/users", { authorization: `Bearer ${u.email}` });
      expect(res.json()).toEqual({ users: [] });
    });
  });

  describe("GET /users/:id", () => {
    it("retorna usuário da própria operação (AGENT pode ler)", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const colega = await createAuthedUser({ operationId: a.operationId, name: "Colega" });
      const res = await http.get(`/users/${colega.user.id}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().user.name).toBe("Colega");
    });

    it("404 para usuário de outra operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      expect((await http.get(`/users/${b.user.id}`, a.headers)).statusCode).toBe(404);
    });
  });

  describe("POST /users", () => {
    it("ADMIN cria usuário na própria operação (ignora operationId do body)", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/users", a.headers, {
        email: "novo@test.com",
        name: "Novo",
        operationId: b.operationId,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().user.operationId).toBe(a.operationId);
      expect(res.json().user.role).toBe("AGENT"); // padrão
    });

    it("MANAGER também pode criar", async () => {
      const m = await createAuthedUser({ role: "MANAGER" });
      const res = await http.post("/users", m.headers, { email: "n2@test.com", name: "N2" });
      expect(res.statusCode).toBe(201);
    });

    it("AGENT não pode criar usuários (403) - evita escalonamento de privilégio", async () => {
      const ag = await createAuthedUser({ role: "AGENT" });
      const res = await http.post("/users", ag.headers, {
        email: "admin-falso@test.com",
        name: "Falso",
        role: "ADMIN",
      });
      expect(res.statusCode).toBe(403);
      expect(await prisma.user.findUnique({ where: { email: "admin-falso@test.com" } })).toBeNull();
    });

    it("409 para e-mail duplicado", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/users", a.headers, { email: a.email, name: "Dup" });
      expect(res.statusCode).toBe(409);
    });

    it("400 para e-mail inválido ou sem nome", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      expect((await http.post("/users", a.headers, { email: "invalido", name: "X" })).statusCode).toBe(400);
      expect((await http.post("/users", a.headers, { email: "ok@test.com" })).statusCode).toBe(400);
    });

    it("400 para usuário sem operação", async () => {
      const u = await prisma.user.create({
        data: { email: "orfao2@test.com", name: "Órfão", role: "ADMIN" },
      });
      const res = await http.post(
        "/users",
        { authorization: `Bearer ${u.email}` },
        { email: "x@test.com", name: "X" },
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /users/:id", () => {
    it("atualiza nome e role", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId });
      const res = await http.put(`/users/${colega.user.id}`, a.headers, { name: "Renomeado", role: "MANAGER" });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ name: "Renomeado", role: "MANAGER" });
    });

    it("não troca a operação do usuário", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId });
      const res = await http.put(`/users/${colega.user.id}`, a.headers, { operationId: b.operationId });
      expect(res.statusCode).toBe(200);
      expect((await prisma.user.findUnique({ where: { id: colega.user.id } }))?.operationId).toBe(a.operationId);
    });

    it("AGENT não pode se promover a ADMIN (403)", async () => {
      const ag = await createAuthedUser({ role: "AGENT" });
      const res = await http.put(`/users/${ag.user.id}`, ag.headers, { role: "ADMIN" });
      expect(res.statusCode).toBe(403);
      expect((await prisma.user.findUnique({ where: { id: ag.user.id } }))?.role).toBe("AGENT");
    });

    it("404 para usuário de outra operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const res = await http.put(`/users/${b.user.id}`, a.headers, { name: "Hack" });
      expect(res.statusCode).toBe(404);
      expect((await prisma.user.findUnique({ where: { id: b.user.id } }))?.name).not.toBe("Hack");
    });

    it("409 ao trocar para e-mail já usado", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId });
      const res = await http.put(`/users/${colega.user.id}`, a.headers, { email: a.email });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("DELETE /users/:id", () => {
    it("ADMIN remove usuário da própria operação (204)", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId });
      expect((await http.del(`/users/${colega.user.id}`, a.headers)).statusCode).toBe(204);
      expect(await prisma.user.findUnique({ where: { id: colega.user.id } })).toBeNull();
    });

    it("AGENT não pode remover usuários (403)", async () => {
      const ag = await createAuthedUser({ role: "AGENT" });
      const colega = await createAuthedUser({ operationId: ag.operationId });
      expect((await http.del(`/users/${colega.user.id}`, ag.headers)).statusCode).toBe(403);
      expect(await prisma.user.findUnique({ where: { id: colega.user.id } })).not.toBeNull();
    });

    it("404 para usuário de outra operação e não remove", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      expect((await http.del(`/users/${b.user.id}`, a.headers)).statusCode).toBe(404);
      expect(await prisma.user.findUnique({ where: { id: b.user.id } })).not.toBeNull();
    });
  });
});
