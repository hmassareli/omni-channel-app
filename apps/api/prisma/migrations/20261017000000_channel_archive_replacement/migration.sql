-- Canal arquivado (histórico preservado) e substituição por outro canal do mesmo número
ALTER TABLE "omni_channels" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "replacedById" TEXT,
ADD COLUMN "replacedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "omni_channels" ADD CONSTRAINT "omni_channels_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "omni_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
