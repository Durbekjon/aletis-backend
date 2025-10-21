/*
  Warnings:

  - You are about to drop the column `quantity` on the `orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "orders" DROP COLUMN "quantity";

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_order_items_order_id" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "idx_order_items_product_id" ON "order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_productId_key" ON "order_items"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
