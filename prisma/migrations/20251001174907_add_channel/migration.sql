/*
  Warnings:

  - A unique constraint covering the columns `[telegramId,organizationId]` on the table `channels` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."ConnectionStatus" AS ENUM ('PENDING', 'NO_BOT', 'NOT_FOUND', 'NOT_ADMIN', 'NO_REQUIRED_PERMISSIONS', 'DONE', 'FAIL');

-- CreateEnum
CREATE TYPE "public"."ChannelType" AS ENUM ('PUBLIC', 'PRIVATE');

-- DropIndex
DROP INDEX "public"."channels_telegramId_key";

-- AlterTable
ALTER TABLE "public"."channels" ADD COLUMN     "connectedBotId" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "public"."ConnectionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "type" "public"."ChannelType" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "username" TEXT,
ALTER COLUMN "telegramId" SET DATA TYPE TEXT,
ALTER COLUMN "title" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."channel_connection_codes" (
    "id" SERIAL NOT NULL,
    "code" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "channel_connection_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_connection_codes_code_key" ON "public"."channel_connection_codes"("code");

-- CreateIndex
CREATE INDEX "channels_telegramId_idx" ON "public"."channels"("telegramId");

-- CreateIndex
CREATE INDEX "channels_username_idx" ON "public"."channels"("username");

-- CreateIndex
CREATE UNIQUE INDEX "channels_telegramId_organizationId_key" ON "public"."channels"("telegramId", "organizationId");

-- AddForeignKey
ALTER TABLE "public"."channels" ADD CONSTRAINT "channels_connectedBotId_fkey" FOREIGN KEY ("connectedBotId") REFERENCES "public"."bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
