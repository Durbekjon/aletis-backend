-- DropIndex
DROP INDEX "public"."customers_username_name_idx";

-- CreateIndex
CREATE INDEX "customers_telegramId_idx" ON "public"."customers"("telegramId");

-- CreateIndex
CREATE INDEX "customers_username_idx" ON "public"."customers"("username");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "public"."customers"("name");
