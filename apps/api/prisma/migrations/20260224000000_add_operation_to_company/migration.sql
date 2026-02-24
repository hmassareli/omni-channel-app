-- AlterTable
ALTER TABLE "companies" ADD COLUMN "operationId" TEXT;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
