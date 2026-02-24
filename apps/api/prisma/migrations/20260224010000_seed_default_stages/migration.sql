-- Seed default stages for ALL existing operations that have onboardingCompleted = true
-- This migration:
-- 1. Deletes all existing stages for operations that completed onboarding
-- 2. Reassigns opportunities from deleted stages to the new "Suspect" stage
-- 3. Creates the 6 default stages for each operation

-- Step 1: For each operation that completed onboarding, create the new default stages
-- We use a DO block for procedural logic
DO $$
DECLARE
    op RECORD;
    suspect_id UUID;
BEGIN
    FOR op IN
        SELECT id FROM omni_operations WHERE "onboardingCompleted" = true
    LOOP
        -- Move all opportunities from this operation's old stages to NULL temporarily
        UPDATE opportunities
        SET "stageId" = NULL
        WHERE "stageId" IN (SELECT id FROM omni_stages WHERE "operationId" = op.id);

        -- Delete old stages for this operation
        DELETE FROM omni_stages WHERE "operationId" = op.id;

        -- Create new default stages
        suspect_id := gen_random_uuid();

        INSERT INTO omni_stages (id, name, slug, "order", color, "operationId", "createdAt", "updatedAt")
        VALUES
            (suspect_id, 'Suspect', 'suspect', 0, '#94a3b8', op.id, NOW(), NOW()),
            (gen_random_uuid(), 'Prospect', 'prospect', 1, '#6366f1', op.id, NOW(), NOW()),
            (gen_random_uuid(), 'Mapeamento', 'mapeamento', 2, '#8b5cf6', op.id, NOW(), NOW()),
            (gen_random_uuid(), 'Demonstração', 'demonstracao', 3, '#a855f7', op.id, NOW(), NOW()),
            (gen_random_uuid(), 'Negociação', 'negociacao', 4, '#d946ef', op.id, NOW(), NOW()),
            (gen_random_uuid(), 'Fechamento', 'fechamento', 5, '#22c55e', op.id, NOW(), NOW());

        -- Reassign orphaned opportunities to the Suspect stage
        UPDATE opportunities
        SET "stageId" = suspect_id
        WHERE "stageId" IS NULL
        AND "companyId" IN (
            SELECT c.id FROM companies c
            JOIN contacts ct ON ct."companyId" = c.id
            JOIN omni_conversations conv ON conv."contactId" = ct.id
            JOIN omni_channels ch ON conv."channelId" = ch.id
            WHERE ch."operationId" = op.id
        );

    END LOOP;
END $$;
