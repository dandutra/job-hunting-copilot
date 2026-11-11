-- CreateTable
CREATE TABLE "label" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "tier_at_draw" TEXT NOT NULL,
    "slot" TEXT,
    "config_version" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "batch" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_draw" (
    "posting_id" INTEGER NOT NULL,
    "tier_at_draw" TEXT NOT NULL,
    "slot" TEXT,
    "config_version" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "drawn_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_draw_pkey" PRIMARY KEY ("posting_id")
);

-- CreateTable
CREATE TABLE "feed_correction" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "jev_tier" TEXT NOT NULL,
    "alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "label_posting_id_idx" ON "label"("posting_id");

-- CreateIndex
CREATE INDEX "label_batch_idx" ON "label"("batch");

-- CreateIndex
CREATE INDEX "feed_correction_posting_id_idx" ON "feed_correction"("posting_id");

-- CreateIndex
CREATE INDEX "feed_correction_created_at_idx" ON "feed_correction"("created_at");

-- AddForeignKey
ALTER TABLE "label" ADD CONSTRAINT "label_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_draw" ADD CONSTRAINT "label_draw_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_correction" ADD CONSTRAINT "feed_correction_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
