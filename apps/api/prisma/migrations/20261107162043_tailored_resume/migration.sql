-- CreateTable
CREATE TABLE "tailored_resume" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "profile_version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "posting_text" TEXT,
    "verdicts" JSONB,
    "reject_note" TEXT,
    "reject_lines" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "tailored_resume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tailored_resume_posting_id_status_idx" ON "tailored_resume"("posting_id", "status");

-- AddForeignKey
ALTER TABLE "tailored_resume" ADD CONSTRAINT "tailored_resume_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_resume" ADD CONSTRAINT "tailored_resume_profile_version_id_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "master_profile_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
