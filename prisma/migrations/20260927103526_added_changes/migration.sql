-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "enriched" JSONB,
ALTER COLUMN "email" DROP NOT NULL;
