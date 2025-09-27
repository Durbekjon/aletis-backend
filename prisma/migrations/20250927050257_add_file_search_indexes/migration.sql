-- CreateIndex
CREATE INDEX "files_originalName_idx" ON "public"."files"("originalName");

-- CreateIndex
CREATE INDEX "files_organizationId_createdAt_idx" ON "public"."files"("organizationId", "createdAt");
