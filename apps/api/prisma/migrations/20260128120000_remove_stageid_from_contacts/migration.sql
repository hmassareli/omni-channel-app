-- Remove stageId from contacts (stage is now on Opportunity)
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_stageId_fkey";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "stageId";
