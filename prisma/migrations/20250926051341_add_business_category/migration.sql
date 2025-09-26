/*
  Warnings:

  - You are about to drop the `FieldValue` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."BUSINESS_CATEGORY" AS ENUM ('FASHION', 'ELECTRONICS', 'COSMETICS', 'SERVICES', 'FOOD', 'BOOKS', 'HOME', 'SPORTS', 'AUTOMOTIVE', 'OTHER');

-- DropForeignKey
ALTER TABLE "public"."FieldValue" DROP CONSTRAINT "FieldValue_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FieldValue" DROP CONSTRAINT "FieldValue_productId_fkey";

-- AlterTable
ALTER TABLE "public"."organizations" ADD COLUMN     "category" "public"."BUSINESS_CATEGORY" NOT NULL DEFAULT 'OTHER';

-- DropTable
DROP TABLE "public"."FieldValue";

-- CreateTable
CREATE TABLE "public"."field_values" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,

    CONSTRAINT "field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_values_productId_fieldId_key" ON "public"."field_values"("productId", "fieldId");

-- AddForeignKey
ALTER TABLE "public"."field_values" ADD CONSTRAINT "field_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."field_values" ADD CONSTRAINT "field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."schema_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
