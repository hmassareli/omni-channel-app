/*
  Warnings:

  - You are about to drop the `stages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('AI', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'AGENT');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'EMAIL', 'INSTAGRAM', 'SMS', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('PENDING', 'CONNECTING', 'WORKING', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- DropForeignKey
ALTER TABLE "contact_tags" DROP CONSTRAINT "contact_tags_tagId_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_stageId_fkey";

-- AlterTable
ALTER TABLE "contact_tags" ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" "TagSource" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "timeline_events" ADD COLUMN     "conversationId" TEXT;

-- DropTable
DROP TABLE "stages";

-- DropTable
DROP TABLE "tags";

-- CreateTable
CREATE TABLE "omni_stages" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "promptCondition" TEXT,
    "autoTransition" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_tag_definitions" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "promptCondition" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_tag_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_operations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "userId" TEXT,
    "operationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'PENDING',
    "externalIdentifier" TEXT,
    "wahaSessionName" TEXT,
    "apiKey" TEXT,
    "metadata" JSONB,
    "operationId" TEXT,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_conversations" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT,
    "subject" TEXT,
    "summary" TEXT,
    "lastSummaryHash" TEXT,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "firstInboundMessageAt" TIMESTAMP(3),
    "firstOutboundMessageAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "isStartedByContact" BOOLEAN,
    "timeToFirstInteraction" INTEGER,
    "lastAnalysisAt" TIMESTAMP(3),
    "needsAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT,
    "identityId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "requiresProcessing" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "omni_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_insight_definitions" (
    "id" TEXT NOT NULL,
    "operationId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "promptInstruction" TEXT,
    "schema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_insight_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omni_contact_insights" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "payload" JSONB,
    "confidence" DOUBLE PRECISION,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "omni_contact_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "omni_stages_operationId_slug_key" ON "omni_stages"("operationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "omni_tag_definitions_operationId_slug_key" ON "omni_tag_definitions"("operationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "omni_users_email_key" ON "omni_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "omni_agents_userId_key" ON "omni_agents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "omni_channels_externalIdentifier_key" ON "omni_channels"("externalIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "omni_channels_wahaSessionName_key" ON "omni_channels"("wahaSessionName");

-- CreateIndex
CREATE INDEX "omni_conversations_contactId_channelId_idx" ON "omni_conversations"("contactId", "channelId");

-- CreateIndex
CREATE INDEX "omni_conversations_needsAnalysis_idx" ON "omni_conversations"("needsAnalysis");

-- CreateIndex
CREATE INDEX "omni_messages_conversationId_sentAt_idx" ON "omni_messages"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "omni_messages_requiresProcessing_idx" ON "omni_messages"("requiresProcessing");

-- CreateIndex
CREATE UNIQUE INDEX "omni_messages_conversationId_externalId_key" ON "omni_messages"("conversationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "omni_insight_definitions_operationId_slug_key" ON "omni_insight_definitions"("operationId", "slug");

-- CreateIndex
CREATE INDEX "omni_contact_insights_contactId_definitionId_idx" ON "omni_contact_insights"("contactId", "definitionId");

-- CreateIndex
CREATE INDEX "timeline_events_conversationId_occurredAt_idx" ON "timeline_events"("conversationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "omni_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_stages" ADD CONSTRAINT "omni_stages_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_tag_definitions" ADD CONSTRAINT "omni_tag_definitions_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "omni_tag_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "omni_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_users" ADD CONSTRAINT "omni_users_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_agents" ADD CONSTRAINT "omni_agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "omni_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_agents" ADD CONSTRAINT "omni_agents_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_channels" ADD CONSTRAINT "omni_channels_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_channels" ADD CONSTRAINT "omni_channels_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "omni_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_conversations" ADD CONSTRAINT "omni_conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_conversations" ADD CONSTRAINT "omni_conversations_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "omni_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_messages" ADD CONSTRAINT "omni_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "omni_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_messages" ADD CONSTRAINT "omni_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_messages" ADD CONSTRAINT "omni_messages_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_insight_definitions" ADD CONSTRAINT "omni_insight_definitions_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "omni_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_contact_insights" ADD CONSTRAINT "omni_contact_insights_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omni_contact_insights" ADD CONSTRAINT "omni_contact_insights_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "omni_insight_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
