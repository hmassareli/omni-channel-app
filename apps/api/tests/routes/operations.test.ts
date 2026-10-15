import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Operations Routes", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  async function userWithoutOperation(email = `semop-${Date.now()}@test.com`) {
    const user = await prisma.user.create({ data: { email, name: "Sem Op", role: "ADMIN" } });
    return { user, headers: { authorization: `Bearer ${user.email}` } };
  }

  it("exige token em todas as rotas", async () => {
    expect((await http.get("/operations")).statusCode).toBe(401);
    expect((await http.get(`/operations/${NIL_UUID}`)).statusCode).toBe(401);
    expect((await http.post("/operations", {}, { name: "x" })).statusCode).toBe(401);
    expect((await http.put(`/operations/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
    expect((await http.del(`/operations/${NIL_UUID}`)).statusCode).toBe(401);
  });

  describe("GET /operations", () => {
    it("retorna a operação do usuário com contagens", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.get("/operations", a.headers);
      expect(res.statusCode).toBe(200);
      const { operation } = res.json();
      expect(operation.id).toBe(a.operationId);
      expect(operation._count).toMatchObject({ users: 1, agents: 1, channels: 0, tags: 0, stages: 0 });
    });

    it("operation null quando o usuário não tem operação", async () => {
      const { headers } = await userWithoutOperation();
      const res = await http.get("/operations", headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ operation: null });
    });
  });

  describe("GET /operations/:id", () => {
    it("retorna a própria operação com relações", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const res = await http.get(`/operations/${a.operationId}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().operation.users).toHaveLength(1);
      expect(res.json().operation.agents).toHaveLength(1);
    });

    it("403 para operação de outro", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      expect((await http.get(`/operations/${b.operationId}`, a.headers)).statusCode).toBe(403);
    });
  });

  describe("POST /operations", () => {
    it("cria a operação e vincula ao usuário", async () => {
      const { user, headers } = await userWithoutOperation();
      const res = await http.post("/operations", headers, { name: "Minha Operação" });
      expect(res.statusCode).toBe(201);
      const op = res.json().operation;
      expect(op.name).toBe("Minha Operação");
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.operationId).toBe(op.id);
    });

    it("400 se o usuário já possui operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      expect((await http.post("/operations", a.headers, { name: "Outra" })).statusCode).toBe(400);
    });

    it("400 sem nome", async () => {
      const { headers } = await userWithoutOperation();
      expect((await http.post("/operations", headers, {})).statusCode).toBe(400);
      expect((await http.post("/operations", headers, { name: "" })).statusCode).toBe(400);
    });
  });

  describe("PUT /operations/:id", () => {
    it("atualiza o nome", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.put(`/operations/${a.operationId}`, a.headers, { name: "Renomeada" });
      expect(res.statusCode).toBe(200);
      expect(res.json().operation.name).toBe("Renomeada");
    });

    it("onboardingCompleted cria os 6 stages padrão uma única vez", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const res = await http.put(`/operations/${a.operationId}`, a.headers, { onboardingCompleted: true });
      expect(res.statusCode).toBe(200);
      expect(res.json().operation.onboardingCompleted).toBe(true);

      const stages = await prisma.stage.findMany({ where: { operationId: a.operationId }, orderBy: { order: "asc" } });
      expect(stages.map((s) => s.slug)).toEqual([
        "suspect",
        "prospect",
        "mapeamento",
        "demonstracao",
        "negociacao",
        "fechamento",
      ]);

      await http.put(`/operations/${a.operationId}`, a.headers, { onboardingCompleted: true });
      expect(await prisma.stage.count({ where: { operationId: a.operationId } })).toBe(6);
    });

    it("não recria stages se a operação já tem stages", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      await prisma.stage.create({ data: { name: "Meu", slug: "meu", operationId: a.operationId } });
      await http.put(`/operations/${a.operationId}`, a.headers, { onboardingCompleted: true });
      expect(await prisma.stage.count({ where: { operationId: a.operationId } })).toBe(1);
    });

    it("403 para operação de outro e nada é alterado", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const before = await prisma.operation.findUnique({ where: { id: b.operationId } });
      const res = await http.put(`/operations/${b.operationId}`, a.headers, { name: "Hack" });
      expect(res.statusCode).toBe(403);
      expect((await prisma.operation.findUnique({ where: { id: b.operationId } }))?.name).toBe(before?.name);
    });
  });

  describe("DELETE /operations/:id", () => {
    it("ADMIN remove a própria operação (204)", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      expect((await http.del(`/operations/${a.operationId}`, a.headers)).statusCode).toBe(204);
      expect(await prisma.operation.findUnique({ where: { id: a.operationId } })).toBeNull();
    });

    it("403 para MANAGER e AGENT", async () => {
      const m = await createAuthedUser({ role: "MANAGER" });
      const ag = await createAuthedUser({ role: "AGENT" });
      expect((await http.del(`/operations/${m.operationId}`, m.headers)).statusCode).toBe(403);
      expect((await http.del(`/operations/${ag.operationId}`, ag.headers)).statusCode).toBe(403);
      expect(await prisma.operation.findUnique({ where: { id: m.operationId } })).not.toBeNull();
    });

    it("403 para operação de outro ADMIN", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      expect((await http.del(`/operations/${b.operationId}`, a.headers)).statusCode).toBe(403);
      expect(await prisma.operation.findUnique({ where: { id: b.operationId } })).not.toBeNull();
    });
  });
});
