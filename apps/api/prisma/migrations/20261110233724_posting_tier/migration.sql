-- CreateTable
CREATE TABLE "posting_tier" (
    "posting_id" INTEGER NOT NULL,
    "judgement_id" INTEGER NOT NULL,
    "config_version" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "caps_applied" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posting_tier_pkey" PRIMARY KEY ("posting_id")
);

-- CreateIndex
CREATE INDEX "posting_tier_judgement_id_idx" ON "posting_tier"("judgement_id");

-- AddForeignKey
ALTER TABLE "posting_tier" ADD CONSTRAINT "posting_tier_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_tier" ADD CONSTRAINT "posting_tier_judgement_id_fkey" FOREIGN KEY ("judgement_id") REFERENCES "jev_judgement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
