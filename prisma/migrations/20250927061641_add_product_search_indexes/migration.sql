/*
  Warnings:

  - The primary key for the `field_values` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `field_values` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."field_values" DROP CONSTRAINT "field_values_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "field_values_pkey" PRIMARY KEY ("id");
