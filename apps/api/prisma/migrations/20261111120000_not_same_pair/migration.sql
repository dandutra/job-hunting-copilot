-- AlterTable
ALTER TABLE "merge_log_entry" ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- Exact-key merges were never waiting for review.
UPDATE "merge_log_entry" SET "reviewed_at" = "created_at" WHERE "rule" IN ('shared_listing_key', 'direct_url');

-- CreateTable
CREATE TABLE "not_same_pair" (
    "id" SERIAL NOT NULL,
    "low_posting_id" INTEGER NOT NULL,
    "high_posting_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "not_same_pair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "not_same_pair_high_posting_id_idx" ON "not_same_pair"("high_posting_id");

-- CreateIndex
CREATE UNIQUE INDEX "not_same_pair_low_posting_id_high_posting_id_key" ON "not_same_pair"("low_posting_id", "high_posting_id");

-- AddForeignKey
ALTER TABLE "not_same_pair" ADD CONSTRAINT "not_same_pair_low_posting_id_fkey" FOREIGN KEY ("low_posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "not_same_pair" ADD CONSTRAINT "not_same_pair_high_posting_id_fkey" FOREIGN KEY ("high_posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
