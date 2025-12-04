/*
  Warnings:

  - You are about to drop the column `apiKey` on the `omni_channels` table. All the data in the column will be lost.
  - You are about to drop the column `wahaSessionName` on the `omni_channels` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "omni_channels_wahaSessionName_key";

-- AlterTable
ALTER TABLE "omni_channels" DROP COLUMN "apiKey",
DROP COLUMN "wahaSessionName";

-- CreateTable
CREATE TABLE "omni_whatsapp_channels" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "proxySession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_whatsapp_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "omni_whatsapp_channels_channelId_key" ON "omni_whatsapp_channels"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "omni_whatsapp_channels_sessionName_key" ON "omni_whatsapp_channels"("sessionName");

-- AddForeignKey
ALTER TABLE "omni_whatsapp_channels" ADD CONSTRAINT "omni_whatsapp_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "omni_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
