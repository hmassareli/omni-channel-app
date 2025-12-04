import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import {
  createContact,
  createOperation,
  createStage,
  createTag,
} from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Contacts Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /contacts
  // =========================================================================
  describe("GET /contacts", () => {
    it("deve retornar lista vazia quando não há contacts", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/contacts",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contacts).toEqual([]);
      expect(data.pagination).toBeDefined();
    });

    it("deve retornar contacts com paginação", async () => {
      await createContact({ name: "Contact 1" });
      await createContact({ name: "Contact 2" });
      await createContact({ name: "Contact 3" });

      const response = await app.inject({
        method: "GET",
        url: "/contacts?limit=2",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contacts).toHaveLength(2);
      expect(data.pagination.total).toBe(3);
      expect(data.pagination.hasMore).toBe(true);
    });

    it("deve filtrar contacts por stageId", async () => {
      const stage1 = await createStage({ name: "Lead" });
      const stage2 = await createStage({ name: "Cliente" });
      await createContact({ name: "Contact Lead", stageId: stage1.id });
      await createContact({ name: "Contact Cliente", stageId: stage2.id });

      const response = await app.inject({
        method: "GET",
        url: `/contacts?stageId=${stage1.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contacts).toHaveLength(1);
      expect(data.contacts[0].name).toBe("Contact Lead");
    });

    it("deve buscar contacts por nome", async () => {
      await createContact({ name: "João Silva" });
      await createContact({ name: "Maria Santos" });
      await createContact({ name: "João Pedro" });

      const response = await app.inject({
        method: "GET",
        url: "/contacts?search=João",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contacts).toHaveLength(2);
    });
  });

  // =========================================================================
  // GET /contacts/:id
  // =========================================================================
  describe("GET /contacts/:id", () => {
    it("deve retornar um contact específico com timeline", async () => {
      const contact = await createContact({ name: "John Doe" });

      const response = await app.inject({
        method: "GET",
        url: `/contacts/${contact.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contact.name).toBe("John Doe");
    });

    it("deve retornar 404 se contact não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "GET",
        url: `/contacts/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // PUT /contacts/:id
  // =========================================================================
  describe("PUT /contacts/:id", () => {
    it("deve atualizar um contact", async () => {
      const contact = await createContact({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/contacts/${contact.id}`,
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contact.name).toBe("New Name");
    });

    it("deve atualizar stage do contact", async () => {
      const stage = await createStage({ name: "Qualificado" });
      const contact = await createContact({ name: "Contact" });

      const response = await app.inject({
        method: "PUT",
        url: `/contacts/${contact.id}`,
        payload: {
          stageId: stage.id,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.contact.stageId).toBe(stage.id);
    });

    it("deve retornar 404 se contact não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "PUT",
        url: `/contacts/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /contacts/:id/tags
  // =========================================================================
  describe("POST /contacts/:id/tags", () => {
    it("deve adicionar uma tag ao contact", async () => {
      const operation = await createOperation();
      const contact = await createContact({ name: "Contact" });
      const tag = await createTag({ name: "VIP", operationId: operation.id });

      const response = await app.inject({
        method: "POST",
        url: `/contacts/${contact.id}/tags`,
        payload: {
          tagId: tag.id,
        },
      });

      expect(response.statusCode).toBe(201);

      // Verifica que a tag foi adicionada
      const checkResponse = await app.inject({
        method: "GET",
        url: `/contacts/${contact.id}`,
      });
      const data = checkResponse.json();
      expect(data.contact.tags).toHaveLength(1);
      expect(data.contact.tags[0].tag.name).toBe("VIP");
    });

    it("deve retornar 404 se contact não existe", async () => {
      const tag = await createTag({ name: "Tag" });
      const fakeId = "11111111-1111-4111-8111-111111111111";

      const response = await app.inject({
        method: "POST",
        url: `/contacts/${fakeId}/tags`,
        payload: {
          tagId: tag.id,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /contacts/:id/tags
  // =========================================================================
  describe("DELETE /contacts/:id/tags", () => {
    it("deve remover uma tag do contact", async () => {
      const operation = await createOperation();
      const contact = await createContact({ name: "Contact" });
      const tag = await createTag({
        name: "ToRemove",
        operationId: operation.id,
      });

      // Adiciona a tag primeiro
      await prisma.contactTag.create({
        data: {
          contactId: contact.id,
          tagId: tag.id,
        },
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/contacts/${contact.id}/tags`,
        payload: {
          tagId: tag.id,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verifica que a tag foi removida
      const checkResponse = await app.inject({
        method: "GET",
        url: `/contacts/${contact.id}`,
      });
      const data = checkResponse.json();
      expect(data.contact.tags).toHaveLength(0);
    });
  });
});
