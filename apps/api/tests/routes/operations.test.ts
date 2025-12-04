import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createChannel,
  createOperation,
  createStage,
  createTag,
} from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Operations Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /operations
  // =========================================================================
  describe("GET /operations", () => {
    it("deve retornar lista vazia quando não há operations", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/operations",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ operations: [] });
    });

    it("deve retornar operations com contagem de relacionamentos", async () => {
      const operation = await createOperation({ name: "Test Operation" });
      await createChannel({ operationId: operation.id });
      await createStage({ operationId: operation.id });
      await createTag({ operationId: operation.id });

      const response = await app.inject({
        method: "GET",
        url: "/operations",
      });

      expect(response.statusCode).toBe(200);
      const { operations } = response.json();
      expect(operations).toHaveLength(1);
      expect(operations[0].name).toBe("Test Operation");
      expect(operations[0]._count.channels).toBe(1);
      expect(operations[0]._count.stages).toBe(1);
      expect(operations[0]._count.tags).toBe(1);
    });
  });

  // =========================================================================
  // GET /operations/:id
  // =========================================================================
  describe("GET /operations/:id", () => {
    it("deve retornar uma operation específica com relacionamentos", async () => {
      const operation = await createOperation({ name: "My Operation" });
      await createChannel({ name: "WhatsApp 1", operationId: operation.id });
      await createStage({ name: "Lead", operationId: operation.id });

      const response = await app.inject({
        method: "GET",
        url: `/operations/${operation.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.operation.name).toBe("My Operation");
      expect(data.operation.channels).toHaveLength(1);
      expect(data.operation.stages).toHaveLength(1);
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "GET",
        url: `/operations/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty("error");
    });
  });

  // =========================================================================
  // POST /operations
  // =========================================================================
  describe("POST /operations", () => {
    it("deve criar uma nova operation", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/operations",
        payload: {
          name: "Nova Operation",
        },
      });

      expect(response.statusCode).toBe(201);
      const { operation } = response.json();
      expect(operation.name).toBe("Nova Operation");
      expect(operation.id).toBeDefined();
    });

    it("deve retornar erro se nome não fornecido", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/operations",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // PUT /operations/:id
  // =========================================================================
  describe("PUT /operations/:id", () => {
    it("deve atualizar uma operation", async () => {
      const operation = await createOperation({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/operations/${operation.id}`,
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.operation.name).toBe("New Name");
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "PUT",
        url: `/operations/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /operations/:id
  // =========================================================================
  describe("DELETE /operations/:id", () => {
    it("deve deletar uma operation", async () => {
      const operation = await createOperation({ name: "To Delete" });

      const response = await app.inject({
        method: "DELETE",
        url: `/operations/${operation.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verifica que foi deletada
      const checkResponse = await app.inject({
        method: "GET",
        url: `/operations/${operation.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "DELETE",
        url: `/operations/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
