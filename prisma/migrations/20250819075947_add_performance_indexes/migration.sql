-- CreateIndex
CREATE INDEX "idx_orders_user_created" ON "public"."orders"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_status" ON "public"."orders"("status");

-- CreateIndex
CREATE INDEX "idx_orders_customer_contact" ON "public"."orders"("customerContact");

-- CreateIndex
CREATE INDEX "idx_orders_user_status" ON "public"."orders"("userId", "status");

-- CreateIndex
CREATE INDEX "idx_orders_created_at" ON "public"."orders"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_user_created_status" ON "public"."orders"("userId", "createdAt" DESC, "status");
