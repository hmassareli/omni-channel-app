import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { createTag } from "../helpers/factories";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Tags Routes", () => {
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
    expect((await http.get("/tags")).statusCode).toBe(401);
    expect((await http.get(`/tags/${NIL_UUID}`)).statusCode).toBe(401);
    expect((await http.post("/tags", {}, { name: "x", operationId: "y" })).statusCode).toBe(401);
    expect((await http.put(`/tags/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
    expect((await http.del(`/tags/${NIL_UUID}`)).statusCode).toBe(401);
  });

  describe("GET /tags", () => {
    it("lista vazia quando não há tags", async () => {
      const a = await createAuthedUser();
      const res = await http.get("/tags", a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ tags: [] });
    });

    it("lista só as tags da operação, ordenadas por nome", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      await createTag({ name: "Zeta", slug: "zeta", operationId: a.operationId });
      await createTag({ name: "Alfa", slug: "alfa", operationId: a.operationId });
      await createTag({ name: "Alheia", slug: "alheia", operationId: b.operationId });

      const res = await http.get("/tags", a.headers);
      expect(res.json().tags.map((t: { name: string }) => t.name)).toEqual(["Alfa", "Zeta"]);
    });

    it("filtra por isActive", async () => {
      const a = await createAuthedUser();
      const tag = await createTag({ name: "Velha", operationId: a.operationId });
      await createTag({ name: "Nova", operationId: a.operationId });
      await prisma.tag.update({ where: { id: tag.id }, data: { isActive: false } });

      const active = await http.get("/tags?isActive=true", a.headers);
      expect(active.json().tags.map((t: { name: string }) => t.name)).toEqual(["Nova"]);
      const inactive = await http.get("/tags?isActive=false", a.headers);
      expect(inactive.json().tags.map((t: { name: string }) => t.name)).toEqual(["Velha"]);
    });
  });

  describe("GET /tags/:id", () => {
    it("retorna a tag da operação", async () => {
      const a = await createAuthedUser();
      const tag = await createTag({ name: "VIP", operationId: a.operationId });
      const res = await http.get(`/tags/${tag.id}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().tag.name).toBe("VIP");
    });

    it("404 para tag de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const tag = await createTag({ operationId: b.operationId });
      expect((await http.get(`/tags/${tag.id}`, a.headers)).statusCode).toBe(404);
    });

    it("400 para id inválido", async () => {
      const a = await createAuthedUser();
      expect((await http.get("/tags/xyz", a.headers)).statusCode).toBe(400);
    });
  });

  describe("POST /tags", () => {
    it("cria tag na operação do usuário e gera slug do nome", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const res = await http.post("/tags", a.headers, {
        name: "Cliente VIP",
        operationId: b.operationId,
        color: "#FF0000",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().tag).toMatchObject({
        name: "Cliente VIP",
        slug: "cliente-vip",
        color: "#FF0000",
        operationId: a.operationId,
      });
    });

    it("usa o slug informado", async () => {
      const a = await createAuthedUser();
      const res = await http.post("/tags", a.headers, {
        name: "Qualquer",
        slug: "meu-slug",
        operationId: a.operationId,
      });
      expect(res.json().tag.slug).toBe("meu-slug");
    });

    it("409 para nome duplicado na mesma operação, mas permite em outra", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      await createTag({ name: "Dup", slug: "dup", operationId: a.operationId });

      const conflict = await http.post("/tags", a.headers, { name: "Dup", slug: "dup2", operationId: a.operationId });
      expect(conflict.statusCode).toBe(409);

      const ok = await http.post("/tags", b.headers, { name: "Dup", slug: "dup", operationId: b.operationId });
      expect(ok.statusCode).toBe(201);
    });

    it("400 para cor, slug ou nome inválidos", async () => {
      const a = await createAuthedUser();
      const base = { operationId: a.operationId };
      expect((await http.post("/tags", a.headers, { ...base, name: "A", color: "vermelho" })).statusCode).toBe(400);
      expect((await http.post("/tags", a.headers, { ...base, name: "A", slug: "Slug Inválido" })).statusCode).toBe(400);
      expect((await http.post("/tags", a.headers, { ...base, name: "" })).statusCode).toBe(400);
    });

    it("400 para usuário sem operação", async () => {
      const u = await prisma.user.create({ data: { email: "orfao-tag@test.com", name: "O" } });
      const res = await http.post("/tags", { authorization: `Bearer ${u.email}` }, { name: "A", operationId: "x" });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /tags/:id", () => {
    it("atualiza campos", async () => {
      const a = await createAuthedUser();
      const tag = await createTag({ name: "Velho", operationId: a.operationId });
      const res = await http.put(`/tags/${tag.id}`, a.headers, { name: "Novo", color: "#00FF00", isActive: false });
      expect(res.statusCode).toBe(200);
      expect(res.json().tag).toMatchObject({ name: "Novo", color: "#00FF00", isActive: false });
    });

    it("409 ao renomear para nome existente", async () => {
      const a = await createAuthedUser();
      await createTag({ name: "Existe", operationId: a.operationId });
      const tag = await createTag({ name: "Outra", operationId: a.operationId });
      const res = await http.put(`/tags/${tag.id}`, a.headers, { name: "Existe" });
      expect(res.statusCode).toBe(409);
    });

    it("404 para tag de outra operação e não altera", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const tag = await createTag({ name: "Intacta", operationId: b.operationId });
      const res = await http.put(`/tags/${tag.id}`, a.headers, { name: "Hack" });
      expect(res.statusCode).toBe(404);
      expect((await prisma.tag.findUnique({ where: { id: tag.id } }))?.name).toBe("Intacta");
    });
  });

  describe("DELETE /tags/:id", () => {
    it("remove a tag (204)", async () => {
      const a = await createAuthedUser();
      const tag = await createTag({ operationId: a.operationId });
      expect((await http.del(`/tags/${tag.id}`, a.headers)).statusCode).toBe(204);
      expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    });

    it("404 para tag de outra operação e não remove", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const tag = await createTag({ operationId: b.operationId });
      expect((await http.del(`/tags/${tag.id}`, a.headers)).statusCode).toBe(404);
      expect(await prisma.tag.findUnique({ where: { id: tag.id } })).not.toBeNull();
    });
  });
});
