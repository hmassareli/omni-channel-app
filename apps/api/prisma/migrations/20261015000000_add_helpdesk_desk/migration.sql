-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');

-- AlterTable: conversas (colunas novas com default => seguro para dados existentes)
ALTER TABLE "omni_conversations"
ADD COLUMN "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "assignedAgentId" TEXT,
ADD COLUMN "queueId" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "csatRequestedAt" TIMESTAMP(3);

-- AlterTable: mensagens
ALTER TABLE "omni_messages" ADD COLUMN "sentByAgentId" TEXT;

-- CreateTable
CREATE TABLE "omni_queues" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_queue_members" (
    "queueId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "omni_queue_members_pkey" PRIMARY KEY ("queueId","agentId")
);

-- CreateTable
CREATE TABLE "omni_csat_responses" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "omni_csat_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "omni_csat_responses_score_check" CHECK ("score" BETWEEN 1 AND 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "omni_queues_operationId_name_key" ON "omni_queues"("operationId", "name");
CREATE INDEX "omni_queue_members_agentId_idx" ON "omni_queue_members"("agentId");
CREATE UNIQUE INDEX "omni_csat_responses_conversationId_key" ON "omni_csat_responses"("conversationId");
CREATE INDEX "omni_conversations_channelId_status_lastMessageAt_idx" ON "omni_conversations"("channelId", "status", "lastMessageAt");
CREATE INDEX "omni_conversations_assignedAgentId_status_idx" ON "omni_conversations"("assignedAgentId", "status");
CREATE INDEX "omni_conversations_queueId_status_idx" ON "omni_conversations"("queueId", "status");

-- AddForeignKey
ALTER TABLE "omni_conversations" ADD CONSTRAINT "omni_conversations_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "omni_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "omni_conversations" ADD CONSTRAINT "omni_conversations_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "omni_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "omni_messages" ADD CONSTRAINT "omni_messages_sentByAgentId_fkey" FOREIGN KEY ("sentByAgentId") REFERENCES "omni_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "omni_queues" ADD CONSTRAINT "omni_queues_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "omni_queue_members" ADD CONSTRAINT "omni_queue_members_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "omni_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "omni_queue_members" ADD CONSTRAINT "omni_queue_members_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "omni_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "omni_csat_responses" ADD CONSTRAINT "omni_csat_responses_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "omni_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
