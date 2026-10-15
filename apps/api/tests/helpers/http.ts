import type { FastifyInstance } from "fastify";

type Headers = Record<string, string>;

/** Atalhos de app.inject para os testes de rota. */
export function client(app: FastifyInstance) {
  const call =
    (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE") =>
    (url: string, headers: Headers = {}, payload?: unknown) =>
      app.inject({
        method,
        url,
        headers,
        ...(payload !== undefined ? { payload: payload as object } : {}),
      });
  return {
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    del: call("DELETE"),
  };
}

export const NIL_UUID = "00000000-0000-4000-8000-000000000000";
