-- CreateTable
CREATE TABLE "master_profile_version" (
    "id" TEXT NOT NULL,
    "raw_yaml" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_profile_version_pkey" PRIMARY KEY ("id")
);
