import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOperation, createUser } from "../helpers/factories";
import { closeTestApp, getTestApp } from "../helpers/test-app";

describe("Users Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // =========================================================================
  // GET /users
  // =========================================================================
  describe("GET /users", () => {
    it("deve retornar lista vazia quando não há users", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/users",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ users: [] });
    });

    it("deve retornar users ordenados por data de criação", async () => {
      await createUser({ name: "User 1" });
      await createUser({ name: "User 2" });

      const response = await app.inject({
        method: "GET",
        url: "/users",
      });

      expect(response.statusCode).toBe(200);
      const { users } = response.json();
      expect(users).toHaveLength(2);
    });

    it("deve filtrar users por operationId", async () => {
      const op1 = await createOperation();
      const op2 = await createOperation();
      await createUser({ name: "User Op1", operationId: op1.id });
      await createUser({ name: "User Op2", operationId: op2.id });

      const response = await app.inject({
        method: "GET",
        url: `/users?operationId=${op1.id}`,
      });

      expect(response.statusCode).toBe(200);
      const { users } = response.json();
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe("User Op1");
    });
  });

  // =========================================================================
  // GET /users/:id
  // =========================================================================
  describe("GET /users/:id", () => {
    it("deve retornar um user específico", async () => {
      const user = await createUser({
        name: "John Doe",
        email: "john@test.com",
      });

      const response = await app.inject({
        method: "GET",
        url: `/users/${user.id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.user.name).toBe("John Doe");
      expect(data.user.email).toBe("john@test.com");
    });

    it("deve retornar 404 se user não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "GET",
        url: `/users/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /users
  // =========================================================================
  describe("POST /users", () => {
    it("deve criar um novo user", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/users",
        payload: {
          name: "Novo User",
          email: "novo@test.com",
        },
      });

      expect(response.statusCode).toBe(201);
      const { user } = response.json();
      expect(user.name).toBe("Novo User");
      expect(user.email).toBe("novo@test.com");
      expect(user.role).toBe("AGENT"); // default
    });

    it("deve criar user com role específico", async () => {
      const operation = await createOperation();

      const response = await app.inject({
        method: "POST",
        url: "/users",
        payload: {
          name: "Admin User",
          email: "admin@test.com",
          role: "ADMIN",
          operationId: operation.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const { user } = response.json();
      expect(user.role).toBe("ADMIN");
      expect(user.operationId).toBe(operation.id);
    });

    it("deve retornar 409 se email já existe", async () => {
      await createUser({ email: "duplicado@test.com" });

      const response = await app.inject({
        method: "POST",
        url: "/users",
        payload: {
          name: "Outro User",
          email: "duplicado@test.com",
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it("deve retornar erro se email inválido", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/users",
        payload: {
          name: "User",
          email: "invalid-email",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // PUT /users/:id
  // =========================================================================
  describe("PUT /users/:id", () => {
    it("deve atualizar um user", async () => {
      const user = await createUser({ name: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/users/${user.id}`,
        payload: {
          name: "New Name",
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.user.name).toBe("New Name");
    });

    it("deve retornar 404 se user não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "PUT",
        url: `/users/${fakeId}`,
        payload: { name: "Test" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /users/:id
  // =========================================================================
  describe("DELETE /users/:id", () => {
    it("deve deletar um user", async () => {
      const user = await createUser({ name: "To Delete" });

      const response = await app.inject({
        method: "DELETE",
        url: `/users/${user.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verifica que foi deletado
      const checkResponse = await app.inject({
        method: "GET",
        url: `/users/${user.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("deve retornar 404 se user não existe", async () => {
      const fakeId = "11111111-1111-4111-8111-111111111111";
      const response = await app.inject({
        method: "DELETE",
        url: `/users/${fakeId}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
