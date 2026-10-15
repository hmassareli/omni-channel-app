import PgBoss from "pg-boss";

// ============================================================================
// Fila durável (pg-boss) sobre o mesmo Postgres do app (DATABASE_URL).
// Início preguiçoso: nada conecta até alguém enfileirar ou subir os workers.
// Em NODE_ENV=test não há conexão: o job roda inline (ver `enqueue`).
// ============================================================================

export const QUEUES = {
  analyzeConversation: "analyze-conversation",
  sendMessage: "send-message",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  "analyze-conversation": { conversationId: string };
  "send-message": { messageId: string };
}

/** Retry com backoff exponencial; análise tem no máximo 1 job pendente por conversa. */
const queueOptions: Record<QueueName, PgBoss.Queue> = {
  "analyze-conversation": {
    name: QUEUES.analyzeConversation,
    policy: "short",
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInMinutes: 10,
  },
  "send-message": {
    name: QUEUES.sendMessage,
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    expireInMinutes: 5,
  },
};

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

/** Em testes a fila é inline: sem conexões abertas. */
export function isInlineQueue() {
  return process.env.NODE_ENV === "test";
}

/** Devolve o pg-boss em execução, iniciando-o (e criando as filas) na primeira chamada. */
export function getBoss(): Promise<PgBoss> {
  if (boss) return Promise.resolve(boss);

  starting ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const instance = new PgBoss({ connectionString });
    instance.on("error", (error) => console.error("[jobs] pg-boss:", error));
    await instance.start();

    for (const options of Object.values(queueOptions)) {
      await instance.createQueue(options.name, options);
    }

    boss = instance;
    return instance;
  })().catch((error) => {
    starting = null; // permite nova tentativa
    throw error;
  });

  return starting;
}

/** Para o pg-boss (aguarda jobs ativos terminarem). No-op se nunca iniciou. */
export async function stopJobs() {
  const pending = starting;
  boss = null;
  starting = null;
  if (!pending) return;

  const instance = await pending.catch(() => null);
  await instance?.stop({ graceful: true, timeout: 10_000 });
}

/**
 * Enfileira um job. Em teste executa o handler na hora (sem fila).
 * `singletonKey` evita duplicar jobs pendentes iguais.
 */
export async function enqueue<Q extends QueueName>(
  queue: Q,
  data: JobPayloads[Q],
  options: { singletonKey?: string } = {},
) {
  if (isInlineQueue()) {
    const { handlers } = await import("./workers");
    await handlers[queue](data);
    return;
  }

  const instance = await getBoss();
  await instance.send(queue, data, options);
}
