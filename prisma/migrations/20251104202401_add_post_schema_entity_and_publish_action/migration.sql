/*
  Warnings:

  - Added the required column `organizationId` to the `posts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'PUBLISH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE 'SCHEMA';
ALTER TYPE "EntityType" ADD VALUE 'POST';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "organizationId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
