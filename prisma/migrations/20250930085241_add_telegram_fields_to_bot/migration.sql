/*
  Warnings:

  - Added the required column `name` to the `bots` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telegramId` to the `bots` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `bots` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."bots" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "telegramId" BIGINT NOT NULL,
ADD COLUMN     "username" TEXT NOT NULL;
