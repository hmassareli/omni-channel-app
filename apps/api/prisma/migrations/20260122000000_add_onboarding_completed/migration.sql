-- Add onboarding completion flag to operations
ALTER TABLE "omni_operations"
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
