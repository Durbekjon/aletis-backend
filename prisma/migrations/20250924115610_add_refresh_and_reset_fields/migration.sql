-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3);
