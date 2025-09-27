-- CreateIndex
CREATE INDEX "field_values_valueText_idx" ON "public"."field_values"("valueText");

-- CreateIndex
CREATE INDEX "field_values_productId_idx" ON "public"."field_values"("productId");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "public"."products"("name");

-- CreateIndex
CREATE INDEX "products_organizationId_createdAt_idx" ON "public"."products"("organizationId", "createdAt");
