import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOperation, createTag } from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Tags Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /tags
  // =========================================================================
  describe("GET /tags", () => {
    it("deve retornar lista vazia quando não há tags", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ tags: [] });
    });

    it("deve retornar tags ordenadas por nome", async () => {
      const operation = await createOperation();
      await createTag({ name: "Zebra", operationId: operation.id });
      await createTag({ name: "Alpha", operationId: operation.id });
      await createTag({ name: "Beta", operationId: operation.id });

      const response = await app.inject({
        method: "GET",
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);
      const { tags } = response.json();
      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe("Alpha");
      expect(tags[1].name).toBe("Beta");
      expect(tags[2].name).toBe("Zebra");
    });

    it("deve filtrar tags por operationId", async () => {
      const op1 = await createOperation();
      const op2 = await createOperation();
      await createTag({ name: "Tag Op1", operationId: op1.id });
      await createTag({ name: "Tag Op2", operationId: op2.id });

      const response = await app.inject({
        method: "GET",
        url: `/tags?operationId=${op1.id}`,
      });

      expect(response.statusCode).toBe(200);
      const { tags } = response.json();
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe("Tag Op1");
    });
  });

  // =========================================================================
  // GET /tags/:id
  // =========================================================================
  describe("GET /tags/:id", () => {
    it("deve retornar uma tag específica", async () => {
      const tag = await createTag({ name: "VIP", color: "#FF0000" });

      const response = await app.inject({
        method: "GET",
        url: `/tags/${tag.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.tag.name).toBe("VIP");
      expect(data.tag.color).toBe("#FF0000");
    });

    it("deve retornar 404 se tag não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "GET",
        url: `/tags/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /tags
  // =========================================================================
  describe("POST /tags", () => {
    it("deve criar uma nova tag", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/tags",
        payload: {
          name: "Nova Tag",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { tag } = response.json();
      expect(tag.name).toBe("Nova Tag");
      expect(tag.slug).toBe("nova-tag");
    });

    it("deve criar tag com todos os campos", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/tags",
        payload: {
          name: "Premium",
          slug: "premium-cliente",
          operationId: operation.id,
          color: "#FFD700",
          promptCondition: "quando cliente for premium",
        },
      });

      expect(response.statusCode).toBe(201);
      const { tag } = response.json();
      expect(tag.slug).toBe("premium-cliente");
      expect(tag.color).toBe("#FFD700");
      expect(tag.promptCondition).toBe("quando cliente for premium");
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "POST",
        url: "/tags",
        payload: {
          name: "Tag",
          operationId: fakeId,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("deve retornar 409 se já existe tag com mesmo nome na operation", async () => {
      const operation = await createOperation();
      await createTag({ name: "Duplicada", operationId: operation.id });

      const response = await app.inject({
        method: "POST",
        url: "/tags",
        payload: {
          name: "Duplicada",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  // =========================================================================
  // PUT /tags/:id
  // =========================================================================
  describe("PUT /tags/:id", () => {
    it("deve atualizar uma tag", async () => {
      const tag = await createTag({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/tags/${tag.id}`,
        payload: {
          name: "New Name",
          color: "#00FF00",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.tag.name).toBe("New Name");
      expect(data.tag.color).toBe("#00FF00");
    });

    it("deve retornar 404 se tag não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "PUT",
        url: `/tags/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /tags/:id
  // =========================================================================
  describe("DELETE /tags/:id", () => {
    it("deve deletar uma tag", async () => {
      const tag = await createTag({ name: "To Delete" });

      const response = await app.inject({
        method: "DELETE",
        url: `/tags/${tag.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verifica que foi deletada
      const checkResponse = await app.inject({
        method: "GET",
        url: `/tags/${tag.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("deve retornar 404 se tag não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "DELETE",
        url: `/tags/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
