-- CreateTable
CREATE TABLE "ingest_cursor" (
    "adapter" TEXT NOT NULL,
    "last_poll_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_cursor_pkey" PRIMARY KEY ("adapter")
);
