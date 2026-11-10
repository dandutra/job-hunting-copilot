-- CreateTable
CREATE TABLE "lookalike" (
    "id" SERIAL NOT NULL,
    "low_posting_id" INTEGER NOT NULL,
    "high_posting_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lookalike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookalike_high_posting_id_idx" ON "lookalike"("high_posting_id");

-- CreateIndex
CREATE UNIQUE INDEX "lookalike_low_posting_id_high_posting_id_key" ON "lookalike"("low_posting_id", "high_posting_id");

-- AddForeignKey
ALTER TABLE "lookalike" ADD CONSTRAINT "lookalike_low_posting_id_fkey" FOREIGN KEY ("low_posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookalike" ADD CONSTRAINT "lookalike_high_posting_id_fkey" FOREIGN KEY ("high_posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
