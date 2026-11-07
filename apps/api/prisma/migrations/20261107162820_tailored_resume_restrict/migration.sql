-- DropForeignKey
ALTER TABLE "tailored_resume" DROP CONSTRAINT "tailored_resume_posting_id_fkey";

-- AddForeignKey
ALTER TABLE "tailored_resume" ADD CONSTRAINT "tailored_resume_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
