import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createContact,
  createOperation,
  createStage,
} from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Stages Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /stages
  // =========================================================================
  describe("GET /stages", () => {
    it("deve retornar lista vazia quando não há stages", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/stages",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ stages: [] });
    });

    it("deve retornar stages ordenados por order", async () => {
      const operation = await createOperation({ name: "Test Op" });
      await createStage({ name: "Lead", order: 0, operationId: operation.id });
      await createStage({
        name: "Qualificado",
        order: 1,
        operationId: operation.id,
      });
      await createStage({
        name: "Proposta",
        order: 2,
        operationId: operation.id,
      });

      const response = await app.inject({
        method: "GET",
        url: "/stages",
      });

      expect(response.statusCode).toBe(200);
      const { stages } = response.json();
      expect(stages).toHaveLength(3);
      expect(stages[0].name).toBe("Lead");
      expect(stages[1].name).toBe("Qualificado");
      expect(stages[2].name).toBe("Proposta");
    });

    it("deve filtrar stages por operationId", async () => {
      const op1 = await createOperation({ name: "Op 1" });
      const op2 = await createOperation({ name: "Op 2" });
      await createStage({ name: "Stage Op1", operationId: op1.id });
      await createStage({ name: "Stage Op2", operationId: op2.id });

      const response = await app.inject({
        method: "GET",
        url: `/stages?operationId=${op1.id}`,
      });

      expect(response.statusCode).toBe(200);
      const { stages } = response.json();
      expect(stages).toHaveLength(1);
      expect(stages[0].name).toBe("Stage Op1");
    });
  });

  // =========================================================================
  // GET /stages/:id
  // =========================================================================
  describe("GET /stages/:id", () => {
    it("deve retornar um stage específico", async () => {
      const operation = await createOperation();
      const stage = await createStage({
        name: "Lead",
        operationId: operation.id,
        color: "#FF0000",
      });

      const response = await app.inject({
        method: "GET",
        url: `/stages/${stage.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.stage.id).toBe(stage.id);
      expect(data.stage.name).toBe("Lead");
      expect(data.stage.color).toBe("#FF0000");
    });

    it("deve retornar 404 se stage não existe", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "GET",
        url: `/stages/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty("error");
    });
  });

  // =========================================================================
  // POST /stages
  // =========================================================================
  describe("POST /stages", () => {
    it("deve criar um novo stage", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/stages",
        payload: {
          name: "Novo Lead",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { stage } = response.json();
      expect(stage.name).toBe("Novo Lead");
      expect(stage.slug).toBe("novo-lead"); // Auto-gerado
      expect(stage.operationId).toBe(operation.id);
    });

    it("deve criar stage com todos os campos", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/stages",
        payload: {
          name: "Qualificado",
          slug: "qualificado",
          operationId: operation.id,
          order: 5,
          color: "#00FF00",
          promptCondition: "quando cliente mostrar interesse",
          autoTransition: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const { stage } = response.json();
      expect(stage.slug).toBe("qualificado");
      expect(stage.order).toBe(5);
      expect(stage.color).toBe("#00FF00");
      expect(stage.promptCondition).toBe("quando cliente mostrar interesse");
      expect(stage.autoTransition).toBe(true);
    });

    it("deve calcular order automaticamente se não fornecido", async () => {
      const operation = await createOperation();
      await createStage({
        name: "Primeiro",
        order: 0,
        operationId: operation.id,
      });
      await createStage({
        name: "Segundo",
        order: 1,
        operationId: operation.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/stages",
        payload: {
          name: "Terceiro",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { stage } = response.json();
      expect(stage.order).toBe(2); // Próximo na sequência
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "POST",
        url: "/stages",
        payload: {
          name: "Lead",
          operationId: fakeId,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("deve retornar erro se nome não fornecido", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/stages",
        payload: {
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // PUT /stages/:id
  // =========================================================================
  describe("PUT /stages/:id", () => {
    it("deve atualizar um stage existente", async () => {
      const stage = await createStage({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/stages/${stage.id}`,
        payload: {
          name: "New Name",
          color: "#0000FF",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.stage.name).toBe("New Name");
      expect(data.stage.color).toBe("#0000FF");
    });

    it("deve retornar 404 se stage não existe", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "PUT",
        url: `/stages/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /stages/:id
  // =========================================================================
  describe("DELETE /stages/:id", () => {
    it("deve deletar um stage sem contatos", async () => {
      const stage = await createStage({ name: "To Delete" });

      const response = await app.inject({
        method: "DELETE",
        url: `/stages/${stage.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verifica que foi realmente deletado
      const checkResponse = await app.inject({
        method: "GET",
        url: `/stages/${stage.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("deve retornar 409 se stage tem contatos", async () => {
      const stage = await createStage({ name: "Stage com contato" });
      await createContact({ name: "Contato", stageId: stage.id });

      const response = await app.inject({
        method: "DELETE",
        url: `/stages/${stage.id}`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toHaveProperty("contactsCount", 1);
    });

    it("deve retornar 404 se stage não existe", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const response = await app.inject({
        method: "DELETE",
        url: `/stages/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /stages/reorder
  // =========================================================================
  describe("POST /stages/reorder", () => {
    it("deve reordenar stages de uma operation", async () => {
      const operation = await createOperation();
      const stage1 = await createStage({
        name: "Primeiro",
        order: 0,
        operationId: operation.id,
      });
      const stage2 = await createStage({
        name: "Segundo",
        order: 1,
        operationId: operation.id,
      });
      const stage3 = await createStage({
        name: "Terceiro",
        order: 2,
        operationId: operation.id,
      });

      // Reordena: Terceiro -> Primeiro -> Segundo
      const response = await app.inject({
        method: "POST",
        url: "/stages/reorder",
        payload: {
          operationId: operation.id,
          stageIds: [stage3.id, stage1.id, stage2.id],
        },
      });

      expect(response.statusCode).toBe(200);
      const { stages } = response.json();
      expect(stages[0].id).toBe(stage3.id);
      expect(stages[0].order).toBe(0);
      expect(stages[1].id).toBe(stage1.id);
      expect(stages[1].order).toBe(1);
      expect(stages[2].id).toBe(stage2.id);
      expect(stages[2].order).toBe(2);
    });

    it("deve retornar 404 se operation não existe", async () => {
      const fakeOperationId = "00000000-0000-0000-0000-000000000000";
      const fakeStageId = "11111111-1111-4111-8111-111111111111"; // UUID v4 válido
      const response = await app.inject({
        method: "POST",
        url: "/stages/reorder",
        payload: {
          operationId: fakeOperationId,
          stageIds: [fakeStageId],
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
