/*
  Warnings:

  - The values [SCHEMA] on the enum `EntityType` will be removed. If these variants are still used in the database, this will fail.
  - The values [SELECT_CATEGORY,CONFIGURE_SCHEMA] on the enum `OnboardingStep` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `isCategorySelected` on the `onboarding_progress` table. All the data in the column will be lost.
  - You are about to drop the column `isSchemaConfigured` on the `onboarding_progress` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `schemaId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `schema_fields` table. All the data in the column will be lost.
  - The `options` column on the `schema_fields` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `product_schemas` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[externalId]` on the table `files` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[schemaId,key]` on the table `schema_fields` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `categoryId` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `key` to the `schema_fields` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label_en` to the `schema_fields` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label_ru` to the `schema_fields` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label_uz` to the `schema_fields` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI');

-- CreateEnum
CREATE TYPE "AiKeyStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterEnum
BEGIN;
CREATE TYPE "EntityType_new" AS ENUM ('PRODUCT', 'ORDER', 'CUSTOMER', 'BOT', 'CHANNEL', 'POST', 'CATEGORY');
ALTER TABLE "activity_logs" ALTER COLUMN "entityType" TYPE "EntityType_new" USING ("entityType"::text::"EntityType_new");
ALTER TYPE "EntityType" RENAME TO "EntityType_old";
ALTER TYPE "EntityType_new" RENAME TO "EntityType";
DROP TYPE "public"."EntityType_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FieldType" ADD VALUE 'ENUM_MULTI';
ALTER TYPE "FieldType" ADD VALUE 'URL';

-- AlterEnum
BEGIN;
CREATE TYPE "OnboardingStep_new" AS ENUM ('ADD_FIRST_PRODUCT', 'CONNECT_BOT', 'CONNECT_CHANNEL');
ALTER TABLE "public"."onboarding_progress" ALTER COLUMN "nextStep" DROP DEFAULT;
ALTER TABLE "onboarding_progress" ALTER COLUMN "nextStep" TYPE "OnboardingStep_new" USING ("nextStep"::text::"OnboardingStep_new");
ALTER TYPE "OnboardingStep" RENAME TO "OnboardingStep_old";
ALTER TYPE "OnboardingStep_new" RENAME TO "OnboardingStep";
DROP TYPE "public"."OnboardingStep_old";
ALTER TABLE "onboarding_progress" ALTER COLUMN "nextStep" SET DEFAULT 'ADD_FIRST_PRODUCT';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."product_schemas" DROP CONSTRAINT "product_schemas_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_schemaId_fkey";

-- DropForeignKey
ALTER TABLE "public"."schema_fields" DROP CONSTRAINT "schema_fields_schemaId_fkey";

-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "webhookSecret" TEXT;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "onboarding_progress" DROP COLUMN "isCategorySelected",
DROP COLUMN "isSchemaConfigured",
ADD COLUMN     "isChannelConnected" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "percentage" SET DEFAULT 0,
ALTER COLUMN "nextStep" SET DEFAULT 'ADD_FIRST_PRODUCT';

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "category";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "schemaId",
ADD COLUMN     "categoryId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "schema_fields" DROP COLUMN "name",
ADD COLUMN     "inheritedFromCategoryId" INTEGER,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "label_en" TEXT NOT NULL,
ADD COLUMN     "label_ru" TEXT NOT NULL,
ADD COLUMN     "label_uz" TEXT NOT NULL,
ADD COLUMN     "validation" JSONB,
ALTER COLUMN "required" SET DEFAULT false,
DROP COLUMN "options",
ADD COLUMN     "options" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "public"."product_schemas";

-- DropEnum
DROP TYPE "public"."BUSINESS_CATEGORY";

-- DropEnum
DROP TYPE "public"."CompanyType";

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "slug" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "iconKey" TEXT,
    "isLeaf" BOOLEAN NOT NULL DEFAULT false,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "path" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_schemas" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "category_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_api_keys" (
    "id" SERIAL NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'GEMINI',
    "label" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "status" "AiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "exhaustedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "category_schemas_categoryId_key" ON "category_schemas"("categoryId");

-- CreateIndex
CREATE INDEX "ai_api_keys_provider_status_exhaustedAt_idx" ON "ai_api_keys"("provider", "status", "exhaustedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_api_keys_provider_label_key" ON "ai_api_keys"("provider", "label");

-- CreateIndex
CREATE INDEX "bots_organizationId_idx" ON "bots"("organizationId");

-- CreateIndex
CREATE INDEX "customers_organizationId_idx" ON "customers"("organizationId");

-- CreateIndex
CREATE INDEX "customers_organizationId_botId_idx" ON "customers"("organizationId", "botId");

-- CreateIndex
CREATE UNIQUE INDEX "files_externalId_key" ON "files"("externalId");

-- CreateIndex
CREATE INDEX "messages_botId_customerId_idx" ON "messages"("botId", "customerId");

-- CreateIndex
CREATE INDEX "messages_customerId_createdAt_idx" ON "messages"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "schema_fields_schemaId_order_idx" ON "schema_fields"("schemaId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "schema_fields_schemaId_key_key" ON "schema_fields"("schemaId", "key");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_schemas" ADD CONSTRAINT "category_schemas_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_fields" ADD CONSTRAINT "schema_fields_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "category_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
