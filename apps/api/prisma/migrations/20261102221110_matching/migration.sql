-- CreateTable
CREATE TABLE "posting" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "description_kind" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sighting" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "job_source" TEXT NOT NULL,
    "listing_key" TEXT NOT NULL,
    "direct_key" TEXT,
    "url" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL,
    "company_id" INTEGER NOT NULL,
    "company_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "description_kind" TEXT NOT NULL,
    "direct_url" TEXT,
    "watched_company_id" INTEGER,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_log_entry" (
    "id" SERIAL NOT NULL,
    "rule" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "sighting_id" INTEGER,
    "absorbed_posting_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posting_company_id_idx" ON "posting"("company_id");

-- CreateIndex
CREATE INDEX "sighting_job_source_listing_key_idx" ON "sighting"("job_source", "listing_key");

-- CreateIndex
CREATE INDEX "sighting_listing_key_idx" ON "sighting"("listing_key");

-- CreateIndex
CREATE INDEX "sighting_direct_key_idx" ON "sighting"("direct_key");

-- CreateIndex
CREATE INDEX "sighting_posting_id_idx" ON "sighting"("posting_id");

-- CreateIndex
CREATE INDEX "sighting_last_seen_at_idx" ON "sighting"("last_seen_at");

-- CreateIndex
CREATE INDEX "merge_log_entry_rule_idx" ON "merge_log_entry"("rule");

-- CreateIndex
CREATE INDEX "merge_log_entry_posting_id_idx" ON "merge_log_entry"("posting_id");

-- AddForeignKey
ALTER TABLE "posting" ADD CONSTRAINT "posting_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_log_entry" ADD CONSTRAINT "merge_log_entry_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_log_entry" ADD CONSTRAINT "merge_log_entry_sighting_id_fkey" FOREIGN KEY ("sighting_id") REFERENCES "sighting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
