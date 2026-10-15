import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { createDeskConversation } from "../helpers/desk";
import { createTag } from "../helpers/factories";
import { client, NIL_UUID } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

let taxSeq = 0;
const createCompany = (operationId: string, name = "ACME") =>
  prisma.company.create({
    data: { taxId: String(10_000_000_000_000 + ++taxSeq), name, operationId },
  });

describe("Contacts Routes", () => {
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
    expect((await http.get("/contacts")).statusCode).toBe(401);
    expect((await http.get(`/contacts/${NIL_UUID}`)).statusCode).toBe(401);
    expect((await http.post("/contacts", {}, { phone: "5511999999999" })).statusCode).toBe(401);
    expect((await http.put(`/contacts/${NIL_UUID}`, {}, { name: "x" })).statusCode).toBe(401);
    expect((await http.patch(`/contacts/${NIL_UUID}/link-company`, {}, { companyId: NIL_UUID })).statusCode).toBe(401);
    expect((await http.post(`/contacts/${NIL_UUID}/tags`, {}, { tagId: NIL_UUID })).statusCode).toBe(401);
    expect((await http.del(`/contacts/${NIL_UUID}/tags`, {})).statusCode).toBe(401);
    expect((await http.get(`/contacts/${NIL_UUID}/timeline`)).statusCode).toBe(401);
    expect((await http.post("/contacts/link-whatsapp", {}, {})).statusCode).toBe(401);
  });

  describe("GET /contacts", () => {
    it("lista só contatos com conversa em canal da operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      await createDeskConversation(a.operationId, { contactName: "Da A" });
      await createDeskConversation(b.operationId, { contactName: "Da B" });
      await prisma.contact.create({ data: { name: "Sem conversa" } });

      const res = await http.get("/contacts", a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().contacts.map((c: { name: string }) => c.name)).toEqual(["Da A"]);
      expect(res.json().pagination.total).toBe(1);
    });

    it("pagina com limit/offset", async () => {
      const a = await createAuthedUser();
      for (let i = 0; i < 3; i++) await createDeskConversation(a.operationId, { contactName: `C${i}` });
      const res = await http.get("/contacts?limit=2", a.headers);
      expect(res.json().contacts).toHaveLength(2);
      expect(res.json().pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
      const page2 = await http.get("/contacts?limit=2&offset=2", a.headers);
      expect(page2.json().contacts).toHaveLength(1);
      expect(page2.json().pagination.hasMore).toBe(false);
    });

    it("busca por nome (case-insensitive)", async () => {
      const a = await createAuthedUser();
      await createDeskConversation(a.operationId, { contactName: "João Silva" });
      await createDeskConversation(a.operationId, { contactName: "Maria Santos" });
      const res = await http.get(`/contacts?search=${encodeURIComponent("joão")}`, a.headers);
      expect(res.json().contacts.map((c: { name: string }) => c.name)).toEqual(["João Silva"]);
    });

    it("busca por identidade (telefone)", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId, { contactName: "Fulano" });
      await createDeskConversation(a.operationId, { contactName: "Outro" });
      const identity = await prisma.identity.findFirstOrThrow({ where: { contactId: contact.id } });
      const res = await http.get(`/contacts?search=${identity.value}`, a.headers);
      expect(res.json().contacts.map((c: { name: string }) => c.name)).toEqual(["Fulano"]);
    });

    it("unlinked=true traz só contatos sem empresa", async () => {
      const a = await createAuthedUser();
      const company = await createCompany(a.operationId);
      const linked = await createDeskConversation(a.operationId, { contactName: "Com empresa" });
      await prisma.contact.update({ where: { id: linked.contact.id }, data: { companyId: company.id } });
      await createDeskConversation(a.operationId, { contactName: "Sem empresa" });

      const res = await http.get("/contacts?unlinked=true", a.headers);
      expect(res.json().contacts.map((c: { name: string }) => c.name)).toEqual(["Sem empresa"]);
    });

    it("lista vazia para usuário sem operação", async () => {
      const u = await prisma.user.create({ data: { email: "orfao-ct@test.com", name: "O" } });
      const res = await http.get("/contacts", { authorization: `Bearer ${u.email}` });
      expect(res.json()).toEqual({ contacts: [], total: 0 });
    });
  });

  describe("GET /contacts/:id", () => {
    it("retorna o contato da operação", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId, { contactName: "Fulano" });
      const res = await http.get(`/contacts/${contact.id}`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().contact.name).toBe("Fulano");
      expect(res.json().contact.conversations).toHaveLength(1);
    });

    it("404 para contato de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId);
      expect((await http.get(`/contacts/${contact.id}`, a.headers)).statusCode).toBe(404);
    });

    it("400 para id inválido", async () => {
      const a = await createAuthedUser();
      expect((await http.get("/contacts/abc", a.headers)).statusCode).toBe(400);
    });
  });

  describe("POST /contacts", () => {
    it("cria contato com identidades de telefone e e-mail", async () => {
      const a = await createAuthedUser();
      const res = await http.post("/contacts", a.headers, {
        name: "Novo",
        phone: "5511911112222",
        email: "novo@cliente.com",
      });
      expect(res.statusCode).toBe(201);
      const types = res.json().contact.identities.map((i: { type: string }) => i.type).sort();
      expect(types).toEqual(["EMAIL", "WHATSAPP"]);
    });

    it("400 sem telefone nem e-mail", async () => {
      const a = await createAuthedUser();
      expect((await http.post("/contacts", a.headers, { name: "X" })).statusCode).toBe(400);
    });

    it("409 para telefone já cadastrado", async () => {
      const a = await createAuthedUser();
      await http.post("/contacts", a.headers, { phone: "5511933334444" });
      const res = await http.post("/contacts", a.headers, { phone: "5511933334444" });
      expect(res.statusCode).toBe(409);
    });

    it("vincula empresa da própria operação", async () => {
      const a = await createAuthedUser();
      const company = await createCompany(a.operationId);
      const res = await http.post("/contacts", a.headers, { phone: "5511955556666", companyId: company.id });
      expect(res.statusCode).toBe(201);
      expect(res.json().contact.companyId).toBe(company.id);
    });

    it("404 ao vincular empresa de outra operação (tenant)", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const foreign = await createCompany(b.operationId);
      const res = await http.post("/contacts", a.headers, { phone: "5511977778888", companyId: foreign.id });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PUT /contacts/:id", () => {
    it("atualiza nome, role e relevance", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const res = await http.put(`/contacts/${contact.id}`, a.headers, {
        name: "Renomeado",
        role: "Diretor",
        relevance: "HIGH",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().contact).toMatchObject({ name: "Renomeado", role: "Diretor", relevance: "HIGH" });
    });

    it("404 para contato de outra operação e não altera", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId, { contactName: "Intacto" });
      expect((await http.put(`/contacts/${contact.id}`, a.headers, { name: "Hack" })).statusCode).toBe(404);
      expect((await prisma.contact.findUnique({ where: { id: contact.id } }))?.name).toBe("Intacto");
    });

    it("400 para relevance inválida", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      expect((await http.put(`/contacts/${contact.id}`, a.headers, { relevance: "X" })).statusCode).toBe(400);
    });
  });

  describe("PATCH /contacts/:id/link-company", () => {
    it("vincula contato e empresa da operação", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const company = await createCompany(a.operationId);
      const res = await http.patch(`/contacts/${contact.id}/link-company`, a.headers, { companyId: company.id });
      expect(res.statusCode).toBe(200);
      expect(res.json().contact.companyId).toBe(company.id);
    });

    it("404 para empresa inexistente", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const res = await http.patch(`/contacts/${contact.id}/link-company`, a.headers, { companyId: NIL_UUID });
      expect(res.statusCode).toBe(404);
    });

    it("404 para contato de outra operação (tenant)", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId);
      const company = await createCompany(a.operationId);
      const res = await http.patch(`/contacts/${contact.id}/link-company`, a.headers, { companyId: company.id });
      expect(res.statusCode).toBe(404);
      expect((await prisma.contact.findUnique({ where: { id: contact.id } }))?.companyId).toBeNull();
    });

    it("404 para empresa de outra operação (tenant)", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const foreign = await createCompany(b.operationId);
      const res = await http.patch(`/contacts/${contact.id}/link-company`, a.headers, { companyId: foreign.id });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /contacts/link-whatsapp", () => {
    it("cria contato, identidade e conversa", async () => {
      const a = await createAuthedUser();
      const company = await createCompany(a.operationId);
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", operationId: a.operationId },
      });
      const res = await http.post("/contacts/link-whatsapp", a.headers, {
        waId: "5511988887777",
        companyId: company.id,
        channelId: channel.id,
        name: "Lead",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ created: true });
      expect(res.json().conversation.channelId).toBe(channel.id);
      expect(res.json().contact.companyId).toBe(company.id);
    });

    it("404 para canal de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const company = await createCompany(a.operationId);
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", operationId: b.operationId },
      });
      const res = await http.post("/contacts/link-whatsapp", a.headers, {
        waId: "5511988880000",
        companyId: company.id,
        channelId: channel.id,
      });
      expect(res.statusCode).toBe(404);
    });

    it("404 para empresa de outra operação (tenant)", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const foreign = await createCompany(b.operationId);
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", operationId: a.operationId },
      });
      const res = await http.post("/contacts/link-whatsapp", a.headers, {
        waId: "5511988881111",
        companyId: foreign.id,
        channelId: channel.id,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("tags do contato", () => {
    it("adiciona (201), rejeita duplicada (409) e remove (204)", async () => {
      const a = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const tag = await createTag({ operationId: a.operationId });

      const add = await http.post(`/contacts/${contact.id}/tags`, a.headers, { tagId: tag.id });
      expect(add.statusCode).toBe(201);
      expect((await http.post(`/contacts/${contact.id}/tags`, a.headers, { tagId: tag.id })).statusCode).toBe(409);

      const detail = await http.get(`/contacts/${contact.id}`, a.headers);
      expect(detail.json().contact.tags).toHaveLength(1);

      const remove = await http.del(`/contacts/${contact.id}/tags`, a.headers);
      expect(remove.statusCode).toBe(400); // body obrigatório
      const removeOk = await app.inject({
        method: "DELETE",
        url: `/contacts/${contact.id}/tags`,
        headers: a.headers,
        payload: { tagId: tag.id },
      });
      expect(removeOk.statusCode).toBe(204);
      expect(await prisma.contactTag.count({ where: { contactId: contact.id } })).toBe(0);
    });

    it("404 ao adicionar tag de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(a.operationId);
      const foreign = await createTag({ operationId: b.operationId });
      const res = await http.post(`/contacts/${contact.id}/tags`, a.headers, { tagId: foreign.id });
      expect(res.statusCode).toBe(404);
    });

    it("404 ao adicionar tag em contato de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId);
      const tag = await createTag({ operationId: a.operationId });
      const res = await http.post(`/contacts/${contact.id}/tags`, a.headers, { tagId: tag.id });
      expect(res.statusCode).toBe(404);
    });

    it("404 ao remover tag de contato de outra operação e não remove (tenant)", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId);
      const tag = await createTag({ operationId: b.operationId });
      await prisma.contactTag.create({ data: { contactId: contact.id, tagId: tag.id } });

      const res = await app.inject({
        method: "DELETE",
        url: `/contacts/${contact.id}/tags`,
        headers: a.headers,
        payload: { tagId: tag.id },
      });
      expect(res.statusCode).toBe(404);
      expect(await prisma.contactTag.count({ where: { contactId: contact.id } })).toBe(1);
    });
  });

  describe("GET /contacts/:id/timeline", () => {
    it("retorna eventos paginados do contato", async () => {
      const a = await createAuthedUser();
      const { contact, conversation } = await createDeskConversation(a.operationId);
      for (let i = 0; i < 3; i++) {
        await prisma.timelineEvent.create({
          data: {
            contactId: contact.id,
            conversationId: conversation.id,
            type: "NOTE",
            content: `nota ${i}`,
            occurredAt: new Date(Date.now() - i * 1000),
          },
        });
      }
      const res = await http.get(`/contacts/${contact.id}/timeline?limit=2`, a.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().events).toHaveLength(2);
      expect(res.json().events[0].content).toBe("nota 0");
      expect(res.json().pagination).toMatchObject({ total: 3, hasMore: true });
    });

    it("404 para contato de outra operação", async () => {
      const a = await createAuthedUser();
      const b = await createAuthedUser();
      const { contact } = await createDeskConversation(b.operationId);
      expect((await http.get(`/contacts/${contact.id}/timeline`, a.headers)).statusCode).toBe(404);
    });
  });
});
