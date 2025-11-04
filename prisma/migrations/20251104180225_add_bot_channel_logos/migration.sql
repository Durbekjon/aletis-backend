-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "logoId" INTEGER;

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "logoId" INTEGER;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
