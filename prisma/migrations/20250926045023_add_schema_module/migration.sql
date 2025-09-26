/*
  Warnings:

  - The values [IMAGE] on the enum `FieldType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `product_field_values` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."FieldType_new" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'FILE', 'BOOLEAN');
ALTER TABLE "public"."schema_fields" ALTER COLUMN "type" TYPE "public"."FieldType_new" USING ("type"::text::"public"."FieldType_new");
ALTER TYPE "public"."FieldType" RENAME TO "FieldType_old";
ALTER TYPE "public"."FieldType_new" RENAME TO "FieldType";
DROP TYPE "public"."FieldType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."product_field_values" DROP CONSTRAINT "product_field_values_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "public"."product_field_values" DROP CONSTRAINT "product_field_values_productId_fkey";

-- DropTable
DROP TABLE "public"."product_field_values";

-- CreateTable
CREATE TABLE "public"."FieldValue" (
    "id" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,

    CONSTRAINT "FieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_productId_fieldId_key" ON "public"."FieldValue"("productId", "fieldId");

-- AddForeignKey
ALTER TABLE "public"."FieldValue" ADD CONSTRAINT "FieldValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldValue" ADD CONSTRAINT "FieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."schema_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
