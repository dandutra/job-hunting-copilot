-- CreateTable
CREATE TABLE "company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ats" TEXT,
    "board_slug" TEXT,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_alias" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,

    CONSTRAINT "company_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_ats_board_slug_key" ON "company"("ats", "board_slug");

-- CreateIndex
CREATE UNIQUE INDEX "company_alias_normalized_name_key" ON "company_alias"("normalized_name");

-- CreateIndex
CREATE INDEX "company_alias_company_id_idx" ON "company_alias"("company_id");

-- AddForeignKey
ALTER TABLE "company_alias" ADD CONSTRAINT "company_alias_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
