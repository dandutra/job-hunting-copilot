-- CreateTable
CREATE TABLE "rendered_file" (
    "id" SERIAL NOT NULL,
    "tailored_resume_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendered_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rendered_file_tailored_resume_id_name_key" ON "rendered_file"("tailored_resume_id", "name");

-- AddForeignKey
ALTER TABLE "rendered_file" ADD CONSTRAINT "rendered_file_tailored_resume_id_fkey" FOREIGN KEY ("tailored_resume_id") REFERENCES "tailored_resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
