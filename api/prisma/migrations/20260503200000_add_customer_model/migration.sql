-- Migrate priority from Int (nullable) to String (not null, default 'normal')
ALTER TABLE "PlannedJob"
    ALTER COLUMN "priority" DROP DEFAULT,
    ALTER COLUMN "priority" TYPE TEXT USING
        CASE
            WHEN "priority" IS NULL THEN 'normal'
            WHEN "priority"::INT <= 1 THEN 'low'
            WHEN "priority"::INT >= 3 THEN 'high'
            ELSE 'normal'
        END,
    ALTER COLUMN "priority" SET NOT NULL,
    ALTER COLUMN "priority" SET DEFAULT 'normal';
