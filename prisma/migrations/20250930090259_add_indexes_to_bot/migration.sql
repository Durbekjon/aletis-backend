-- CreateIndex
CREATE INDEX "bots_organizationId_name_idx" ON "public"."bots"("organizationId", "name");

-- CreateIndex
CREATE INDEX "bots_organizationId_username_idx" ON "public"."bots"("organizationId", "username");
