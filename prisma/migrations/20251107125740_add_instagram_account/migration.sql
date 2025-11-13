-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_instagramUserId_key" ON "instagram_accounts"("instagramUserId");

-- CreateIndex
CREATE INDEX "instagram_accounts_organizationId_idx" ON "instagram_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "instagram_accounts_instagramUserId_idx" ON "instagram_accounts"("instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_organizationId_instagramUserId_key" ON "instagram_accounts"("organizationId", "instagramUserId");

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
