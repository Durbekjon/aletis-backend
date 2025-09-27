-- AlterTable
ALTER TABLE "public"."schema_fields" ADD COLUMN     "options" TEXT[] DEFAULT ARRAY[]::TEXT[];
