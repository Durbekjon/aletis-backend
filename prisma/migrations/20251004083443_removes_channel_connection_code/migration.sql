/*
  Warnings:

  - The values [NO_BOT] on the enum `ConnectionStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `type` on the `channels` table. All the data in the column will be lost.
  - You are about to drop the `channel_connection_codes` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[telegramId]` on the table `channels` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[username]` on the table `channels` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId]` on the table `channels` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramId,username,organizationId]` on the table `channels` will be added. If there are existing duplicate values, this will fail.
  - Made the column `telegramId` on table `channels` required. This step will fail if there are existing NULL values in that column.
  - Made the column `title` on table `channels` required. This step will fail if there are existing NULL values in that column.
  - Made the column `username` on table `channels` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."ConnectionStatus_new" AS ENUM ('PENDING', 'NOT_FOUND', 'NOT_ADMIN', 'NO_REQUIRED_PERMISSIONS', 'DONE', 'FAIL');
ALTER TABLE "public"."channels" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."channels" ALTER COLUMN "status" TYPE "public"."ConnectionStatus_new" USING ("status"::text::"public"."ConnectionStatus_new");
ALTER TYPE "public"."ConnectionStatus" RENAME TO "ConnectionStatus_old";
ALTER TYPE "public"."ConnectionStatus_new" RENAME TO "ConnectionStatus";
DROP TYPE "public"."ConnectionStatus_old";
ALTER TABLE "public"."channels" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX "public"."channels_telegramId_idx";

-- DropIndex
DROP INDEX "public"."channels_telegramId_organizationId_key";

-- DropIndex
DROP INDEX "public"."channels_username_idx";

-- AlterTable
ALTER TABLE "public"."channels" DROP COLUMN "type",
ALTER COLUMN "telegramId" SET NOT NULL,
ALTER COLUMN "title" SET NOT NULL,
ALTER COLUMN "username" SET NOT NULL;

-- DropTable
DROP TABLE "public"."channel_connection_codes";

-- DropEnum
DROP TYPE "public"."ChannelType";

-- CreateIndex
CREATE UNIQUE INDEX "channels_telegramId_key" ON "public"."channels"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_username_key" ON "public"."channels"("username");

-- CreateIndex
CREATE UNIQUE INDEX "channels_organizationId_key" ON "public"."channels"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_telegramId_username_organizationId_key" ON "public"."channels"("telegramId", "username", "organizationId");
