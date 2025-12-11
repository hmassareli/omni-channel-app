-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "status" TEXT,
    "statusId" INTEGER,
    "statusDate" TIMESTAMP(3),
    "founded" TIMESTAMP(3),
    "head" BOOLEAN NOT NULL DEFAULT true,
    "equity" DECIMAL(65,30),
    "sizeId" INTEGER,
    "sizeAcronym" TEXT,
    "sizeText" TEXT,
    "natureId" INTEGER,
    "natureText" TEXT,
    "mainActivityId" INTEGER,
    "mainActivityText" TEXT,
    "sideActivities" JSONB,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressDetails" TEXT,
    "addressDistrict" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "addressMunicipality" INTEGER,
    "addressCountryId" INTEGER,
    "addressCountryName" TEXT,
    "phones" JSONB,
    "emails" JSONB,
    "members" JSONB,
    "sourceApi" TEXT DEFAULT 'CNPJA',
    "apiUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxId_key" ON "companies"("taxId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
