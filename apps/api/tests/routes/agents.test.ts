import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { createAgent } from "../helpers/factories";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Agents Routes", () => {
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
      expect((await http.get("/agents")).statusCode).toBe(401);
      expect((await http.get(`/agents/${NIL_UUID}`)).statusCode).toBe(401);
      expect((await http.post("/agents", {}, { name: "x" })).statusCode).toBe(401);
      expect((await http.put(`/agents/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
      expect((await http.del(`/agents/${NIL_UUID}`)).statusCode).toBe(401);
    });

    it("rejeita usuário não cadastrado com 403", async () => {
      const res = await http.get("/agents", { authorization: "Bearer ninguem@test.com" });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /agents", () => {
    it("lista apenas os agentes da operação do usuário", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      await createAgent({ name: "Extra A", operationId: a.operationId });
      await createAgent({ name: "Extra B", operationId: b.operationId });

      const res = await http.get("/agents", a.headers);
      expect(res.statusCode).toBe(200);
      const names = res.json().agents.map((x: { name: string }) => x.name);
      expect(names).toContain("Extra A");
      expect(names).not.toContain("Extra B");
      expect(res.json().agents).toHaveLength(2); // agente do próprio usuário + Extra A
    });

    it("usuário sem operação recebe lista vazia", async () => {
      const u = await prisma.user.create({ data: { email: "sem-op@test.com", name: "Sem Op" } });
      const res = await http.get("/agents", { authorization: `Bearer ${u.email}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ agents: [] });
    });
  });

  describe("GET /agents/:id", () => {
    it("retorna o agente da própria operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ name: "Fulano", operationId: a.operationId });
      const res = await http.get(`/agents/${agent.id}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().agent.name).toBe("Fulano");
    });

    it("404 para agente de outra operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ operationId: b.operationId });
      expect((await http.get(`/agents/${agent.id}`, a.headers)).statusCode).toBe(404);
    });

    it("400 para id inválido", async () => {
      const a = await createAuthedUser();
      expect((await http.get("/agents/abc", a.headers)).statusCode).toBe(400);
    });
  });

  describe("POST /agents", () => {
    it("cria agente na operação do usuário, ignorando operationId do body", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/agents", a.headers, { name: "Novo", operationId: b.operationId });
      expect(res.statusCode).toBe(201);
      expect(res.json().agent.operationId).toBe(a.operationId);
    });

    it("vincula um usuário da mesma operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const colega = await createAuthedUser({ operationId: a.operationId, withAgent: false });
      const res = await http.post("/agents", a.headers, {
        name: "Colega",
        operationId: a.operationId,
        userId: colega.user.id,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().agent.user.id).toBe(colega.user.id);
    });

    it("403 ao vincular usuário de outra operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ withAgent: false });
      const res = await http.post("/agents", a.headers, {
        name: "X",
        operationId: a.operationId,
        userId: b.user.id,
      });
      expect(res.statusCode).toBe(403);
    });

    it("409 se o usuário já tem agente", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/agents", a.headers, {
        name: "Dup",
        operationId: a.operationId,
        userId: a.user.id,
      });
      expect(res.statusCode).toBe(409);
    });

    it("404 para userId inexistente", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/agents", a.headers, {
        name: "X",
        operationId: a.operationId,
        userId: NIL_UUID,
      });
      expect(res.statusCode).toBe(404);
    });

    it("400 sem nome", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.post("/agents", a.headers, { operationId: a.operationId });
      expect(res.statusCode).toBe(400);
    });

    it("400 para usuário sem operação", async () => {
      const u = await prisma.user.create({ data: { email: "sem-op2@test.com", name: "S" } });
      const res = await http.post(
        "/agents",
        { authorization: `Bearer ${u.email}` },
        { name: "X", operationId: "qualquer" },
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /agents/:id", () => {
    it("atualiza o nome", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ name: "Antigo", operationId: a.operationId });
      const res = await http.put(`/agents/${agent.id}`, a.headers, { name: "Novo" });
      expect(res.statusCode).toBe(200);
      expect(res.json().agent.name).toBe("Novo");
    });

    it("404 para agente de outra operação e nada é alterado", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ name: "Intacto", operationId: b.operationId });
      const res = await http.put(`/agents/${agent.id}`, a.headers, { name: "Hack" });
      expect(res.statusCode).toBe(404);
      expect((await prisma.agent.findUnique({ where: { id: agent.id } }))?.name).toBe("Intacto");
    });

    it("não permite vincular usuário de outra operação (tenant)", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ withAgent: false });
      const agent = await createAgent({ operationId: a.operationId });
      const res = await http.put(`/agents/${agent.id}`, a.headers, { userId: b.user.id });
      expect(res.statusCode).toBe(404);
      expect((await prisma.agent.findUnique({ where: { id: agent.id } }))?.userId).toBeNull();
    });

    it("409 ao vincular usuário que já tem outro agente", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ operationId: a.operationId });
      const res = await http.put(`/agents/${agent.id}`, a.headers, { userId: a.user.id });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("DELETE /agents/:id", () => {
    it("remove o agente (204)", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ operationId: a.operationId });
      expect((await http.del(`/agents/${agent.id}`, a.headers)).statusCode).toBe(204);
      expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull();
    });

    it("404 para agente de outra operação e não remove", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const agent = await createAgent({ operationId: b.operationId });
      expect((await http.del(`/agents/${agent.id}`, a.headers)).statusCode).toBe(404);
      expect(await prisma.agent.findUnique({ where: { id: agent.id } })).not.toBeNull();
    });
  });
});
