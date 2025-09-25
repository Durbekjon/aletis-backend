/*
  Warnings:

  - You are about to drop the column `description` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `products` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `products` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - Added the required column `images` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schemaId` to the `products` table without a default value. This is not possible if the table is not empty.
  - Made the column `price` on table `products` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'IMAGE', 'BOOLEAN');

-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_organizationId_fkey";

-- AlterTable
ALTER TABLE "public"."products" DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "stock",
ADD COLUMN     "images" JSONB NOT NULL,
ADD COLUMN     "schemaId" INTEGER NOT NULL,
ALTER COLUMN "price" SET NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."product_schemas" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,

    CONSTRAINT "product_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."schema_fields" (
    "id" SERIAL NOT NULL,
    "schemaId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL,

    CONSTRAINT "schema_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_field_values" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "product_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_schemas_organizationId_key" ON "public"."product_schemas"("organizationId");

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "public"."product_schemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_schemas" ADD CONSTRAINT "product_schemas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."schema_fields" ADD CONSTRAINT "schema_fields_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "public"."product_schemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_field_values" ADD CONSTRAINT "product_field_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_field_values" ADD CONSTRAINT "product_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."schema_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
