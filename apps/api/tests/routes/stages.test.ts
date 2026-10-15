import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { createStage } from "../helpers/factories";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Stages Routes", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it("exige token em todas as rotas", async () => {
    expect((await http.get("/stages")).statusCode).toBe(401);
    expect((await http.get(`/stages/${NIL_UUID}`)).statusCode).toBe(401);
    expect((await http.post("/stages", {}, { name: "x", operationId: NIL_UUID })).statusCode).toBe(401);
    expect((await http.put(`/stages/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
    expect((await http.post("/stages/reorder", {}, { operationId: NIL_UUID, stageIds: [NIL_UUID] })).statusCode).toBe(401);
    expect((await http.del(`/stages/${NIL_UUID}`)).statusCode).toBe(401);
  });

  describe("GET /stages", () => {
    it("lista vazia quando não há stages", async () => {
      const a = await createAuthedUser();
      const res = await http.get("/stages", a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ stages: [] });
    });

    it("lista ordenada por order e só da própria operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      await createStage({ name: "Proposta", order: 2, operationId: a.operationId });
      await createStage({ name: "Lead", order: 0, operationId: a.operationId });
      await createStage({ name: "Qualificado", order: 1, operationId: a.operationId });
      await createStage({ name: "Alheio", order: 0, operationId: b.operationId });

      const res = await http.get("/stages", a.headers);
      expect(res.json().stages.map((s: { name: string }) => s.name)).toEqual(["Lead", "Qualificado", "Proposta"]);
    });
  });

  describe("GET /stages/:id", () => {
    it("retorna o stage da operação", async () => {
      const a = await createAuthedUser();
      const stage = await createStage({ name: "Lead", operationId: a.operationId });
      const res = await http.get(`/stages/${stage.id}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().stage.name).toBe("Lead");
    });

    it("404 para stage de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const stage = await createStage({ operationId: b.operationId });
      expect((await http.get(`/stages/${stage.id}`, a.headers)).statusCode).toBe(404);
    });
  });

  describe("POST /stages", () => {
    it("cria no final, gera slug e ignora operationId do body", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      await createStage({ name: "Primeiro", order: 0, operationId: a.operationId });

      const res = await http.post("/stages", a.headers, {
        name: "Em Negociação",
        operationId: b.operationId,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().stage).toMatchObject({
        name: "Em Negociação",
        slug: "em-negociao",
        order: 1,
        operationId: a.operationId,
        autoTransition: false,
      });
    });

    it("primeiro stage da operação recebe order 0", async () => {
      const a = await createAuthedUser();
      const res = await http.post("/stages", a.headers, { name: "Lead", operationId: a.operationId });
      expect(res.json().stage.order).toBe(0);
    });

    it("respeita order, color e autoTransition informados", async () => {
      const a = await createAuthedUser();
      const res = await http.post("/stages", a.headers, {
        name: "Fechado",
        slug: "fechado",
        operationId: a.operationId,
        order: 5,
        color: "#22c55e",
        autoTransition: true,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().stage).toMatchObject({ slug: "fechado", order: 5, color: "#22c55e", autoTransition: true });
    });

    it("400 para operationId que não é UUID, cor ou nome inválidos", async () => {
      const a = await createAuthedUser();
      expect((await http.post("/stages", a.headers, { name: "A", operationId: "nao-uuid" })).statusCode).toBe(400);
      expect((await http.post("/stages", a.headers, { name: "A", operationId: a.operationId, color: "x" })).statusCode).toBe(400);
      expect((await http.post("/stages", a.headers, { name: "", operationId: a.operationId })).statusCode).toBe(400);
    });

    it("400 para usuário sem operação", async () => {
      const u = await prisma.user.create({ data: { email: "orfao-stage@test.com", name: "O" } });
      const res = await http.post(
        "/stages",
        { authorization: `Bearer ${u.email}` },
        { name: "A", operationId: NIL_UUID },
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /stages/:id", () => {
    it("atualiza campos", async () => {
      const a = await createAuthedUser();
      const stage = await createStage({ name: "Velho", operationId: a.operationId });
      const res = await http.put(`/stages/${stage.id}`, a.headers, { name: "Novo", color: "#ff0000", autoTransition: true });
      expect(res.statusCode).toBe(200);
      expect(res.json().stage).toMatchObject({ name: "Novo", color: "#ff0000", autoTransition: true });
    });

    it("404 para stage de outra operação e não altera", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const stage = await createStage({ name: "Intacto", operationId: b.operationId });
      expect((await http.put(`/stages/${stage.id}`, a.headers, { name: "Hack" })).statusCode).toBe(404);
      expect((await prisma.stage.findUnique({ where: { id: stage.id } }))?.name).toBe("Intacto");
    });
  });

  describe("POST /stages/reorder", () => {
    it("reordena os stages da operação", async () => {
      const a = await createAuthedUser();
      const s1 = await createStage({ name: "A", order: 0, operationId: a.operationId });
      const s2 = await createStage({ name: "B", order: 1, operationId: a.operationId });
      const s3 = await createStage({ name: "C", order: 2, operationId: a.operationId });

      const res = await http.post("/stages/reorder", a.headers, {
        operationId: a.operationId,
        stageIds: [s3.id, s1.id, s2.id],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().stages.map((s: { name: string }) => s.name)).toEqual(["C", "A", "B"]);
    });

    it("ignora stages de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const mine = await createStage({ order: 0, operationId: a.operationId });
      const foreign = await createStage({ order: 7, operationId: b.operationId });

      const res = await http.post("/stages/reorder", a.headers, {
        operationId: a.operationId,
        stageIds: [foreign.id, mine.id],
      });
      expect(res.statusCode).toBe(200);
      expect((await prisma.stage.findUnique({ where: { id: foreign.id } }))?.order).toBe(7);
      expect((await prisma.stage.findUnique({ where: { id: mine.id } }))?.order).toBe(1);
    });

    it("400 para lista vazia", async () => {
      const a = await createAuthedUser();
      const res = await http.post("/stages/reorder", a.headers, { operationId: a.operationId, stageIds: [] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /stages/:id", () => {
    it("remove stage sem oportunidades (204)", async () => {
      const a = await createAuthedUser();
      const stage = await createStage({ operationId: a.operationId });
      expect((await http.del(`/stages/${stage.id}`, a.headers)).statusCode).toBe(204);
      expect(await prisma.stage.findUnique({ where: { id: stage.id } })).toBeNull();
    });

    it("409 se há oportunidades vinculadas", async () => {
      const a = await createAuthedUser();
      const stage = await createStage({ operationId: a.operationId });
      const company = await prisma.company.create({
        data: { taxId: `1${Date.now()}`.slice(0, 14), name: "ACME", operationId: a.operationId },
      });
      await prisma.opportunity.create({
        data: { companyId: company.id, stageId: stage.id },
      });

      const res = await http.del(`/stages/${stage.id}`, a.headers);
      expect(res.statusCode).toBe(409);
      expect(res.json().opportunitiesCount).toBe(1);
      expect(await prisma.stage.findUnique({ where: { id: stage.id } })).not.toBeNull();
    });

    it("404 para stage de outra operação e não remove", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const stage = await createStage({ operationId: b.operationId });
      expect((await http.del(`/stages/${stage.id}`, a.headers)).statusCode).toBe(404);
      expect(await prisma.stage.findUnique({ where: { id: stage.id } })).not.toBeNull();
    });
  });
});
