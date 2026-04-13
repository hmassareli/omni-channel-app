ALTER TABLE "companies"
ADD COLUMN "sector" TEXT,
ADD COLUMN "annualRevenue" TEXT,
ADD COLUMN "employeeCount" INTEGER,
ADD COLUMN "apparentWealthSigns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];