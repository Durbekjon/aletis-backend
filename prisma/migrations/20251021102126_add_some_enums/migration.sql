-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
