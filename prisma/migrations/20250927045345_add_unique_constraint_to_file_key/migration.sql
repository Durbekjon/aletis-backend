/*
  Warnings:

  - A unique constraint covering the columns `[key]` on the table `files` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "files_key_key" ON "public"."files"("key");
