-- CreateTable
CREATE TABLE "jev_failure" (
    "id" SERIAL NOT NULL,
    "posting_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jev_failure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jev_failure_posting_id_idx" ON "jev_failure"("posting_id");

-- CreateIndex
CREATE INDEX "jev_failure_created_at_idx" ON "jev_failure"("created_at");

-- AddForeignKey
ALTER TABLE "jev_failure" ADD CONSTRAINT "jev_failure_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
