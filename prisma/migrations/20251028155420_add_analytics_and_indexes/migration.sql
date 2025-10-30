/*
  Warnings:

  - The values [FILE,IMAGE] on the enum `FieldType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FieldType_new" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ENUM');
ALTER TABLE "schema_fields" ALTER COLUMN "type" TYPE "FieldType_new" USING ("type"::text::"FieldType_new");
ALTER TYPE "FieldType" RENAME TO "FieldType_old";
ALTER TYPE "FieldType_new" RENAME TO "FieldType";
DROP TYPE "public"."FieldType_old";
COMMIT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "isInquiry" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "analytics_daily_aggregates" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "inquiries" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "ordersCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_analytics_org_day" ON "analytics_daily_aggregates"("organizationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_aggregates_organizationId_day_key" ON "analytics_daily_aggregates"("organizationId", "day");

-- CreateIndex
CREATE INDEX "idx_orders_org_created" ON "orders"("organizationId", "createdAt");
