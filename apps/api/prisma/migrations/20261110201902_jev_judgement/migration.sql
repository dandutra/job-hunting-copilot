-- CreateTable
CREATE TABLE "jev_judgement" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "profile_version_id" TEXT NOT NULL,
    "question_set_version" TEXT NOT NULL,
    "description_kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jev_judgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jev_judgement_posting_id_created_at_idx" ON "jev_judgement"("posting_id", "created_at");

-- CreateIndex
CREATE INDEX "jev_judgement_profile_version_id_idx" ON "jev_judgement"("profile_version_id");

-- AddForeignKey
ALTER TABLE "jev_judgement" ADD CONSTRAINT "jev_judgement_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jev_judgement" ADD CONSTRAINT "jev_judgement_profile_version_id_fkey" FOREIGN KEY ("profile_version_id") REFERENCES "master_profile_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
