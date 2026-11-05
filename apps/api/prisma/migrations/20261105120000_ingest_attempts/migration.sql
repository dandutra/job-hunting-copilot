-- AlterTable
ALTER TABLE "ingest_cursor" ADD COLUMN "last_attempt_at" TIMESTAMP(3),
ALTER COLUMN "last_poll_at" DROP NOT NULL;

UPDATE "ingest_cursor" SET "last_attempt_at" = "last_poll_at";
