import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgent, createOperation, createUser } from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Agents Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /agents
  // =========================================================================
  describe("GET /agents", () => {
    it("deve retornar lista vazia quando não há agents", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ agents: [] });
    });

    it("deve retornar agents com relacionamentos", async () => {
      const operation = await createOperation();
      await createAgent({ name: "Agent 1", operationId: operation.id });
      await createAgent({ name: "Agent 2", operationId: operation.id });

      const response = await app.inject({
        method: "GET",
        url: "/agents",
      });

      expect(response.statusCode).toBe(200);
      const { agents } = response.json();
      expect(agents).toHaveLength(2);
    });

    it("deve filtrar agents por operationId", async () => {
      const op1 = await createOperation();
      const op2 = await createOperation();
      await createAgent({ name: "Agent Op1", operationId: op1.id });
      await createAgent({ name: "Agent Op2", operationId: op2.id });

      const response = await app.inject({
        method: "GET",
        url: `/agents?operationId=${op1.id}`,
      });

      expect(response.statusCode).toBe(200);
      const { agents } = response.json();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("Agent Op1");
    });
  });

  // =========================================================================
  // GET /agents/:id
  // =========================================================================
  describe("GET /agents/:id", () => {
    it("deve retornar um agent específico", async () => {
      const agent = await createAgent({ name: "John Agent" });

      const response = await app.inject({
        method: "GET",
        url: `/agents/${agent.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.agent.name).toBe("John Agent");
    });

    it("deve retornar 404 se agent não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "GET",
        url: `/agents/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /agents
  // =========================================================================
  describe("POST /agents", () => {
    it("deve criar um novo agent", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          name: "Novo Agent",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { agent } = response.json();
      expect(agent.name).toBe("Novo Agent");
      expect(agent.operationId).toBe(operation.id);
    });

    it("deve criar agent vinculado a um user", async () => {
      const operation = await createOperation();
      const user = await createUser({ operationId: operation.id });

      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          name: "Agent com User",
          operationId: operation.id,
          userId: user.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { agent } = response.json();
      expect(agent.userId).toBe(user.id);
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          name: "Agent",
          operationId: fakeId,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // PUT /agents/:id
  // =========================================================================
  describe("PUT /agents/:id", () => {
    it("deve atualizar um agent", async () => {
      const agent = await createAgent({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/agents/${agent.id}`,
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.agent.name).toBe("New Name");
    });

    it("deve retornar 404 se agent não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "PUT",
        url: `/agents/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /agents/:id
  // =========================================================================
  describe("DELETE /agents/:id", () => {
    it("deve deletar um agent", async () => {
      const agent = await createAgent({ name: "To Delete" });

      const response = await app.inject({
        method: "DELETE",
        url: `/agents/${agent.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verifica que foi deletado
      const checkResponse = await app.inject({
        method: "GET",
        url: `/agents/${agent.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("deve retornar 404 se agent não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "DELETE",
        url: `/agents/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
