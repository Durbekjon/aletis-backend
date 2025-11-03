-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "logoId" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "logoId" INTEGER;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
