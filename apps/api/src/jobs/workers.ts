import { analyzeConversation } from "../services/conversation-analysis";
import { deliverMessage } from "../services/conversations/send";
import { getBoss, QUEUES, type JobPayloads, type QueueName } from "./boss";

/** Handler de cada fila. Se lançar erro, o pg-boss refaz a tentativa (backoff). */
export const handlers: { [Q in QueueName]: (data: JobPayloads[Q]) => Promise<void> } = {
  "analyze-conversation": ({ conversationId }) =>
    analyzeConversation(conversationId),
  "send-message": ({ messageId }) => deliverMessage(messageId),
};

const analysisConcurrency = Math.max(
  1,
  Number(process.env.CONVERSATION_ANALYSIS_CONCURRENCY ?? 1),
);

/** Sobe o pg-boss e registra os workers. Chamado no bootstrap do servidor. */
export async function startJobs() {
  const boss = await getBoss();

  for (let i = 0; i < analysisConcurrency; i += 1) {
    await boss.work<JobPayloads["analyze-conversation"]>(
      QUEUES.analyzeConversation,
      async ([job]) => handlers["analyze-conversation"](job.data),
    );
  }

  await boss.work<JobPayloads["send-message"]>(
    QUEUES.sendMessage,
    async ([job]) => handlers["send-message"](job.data),
  );
}
