-- CreateTable
CREATE TABLE "SignInFailure" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "browser" TEXT NOT NULL,
    "verifier" BOOLEAN NOT NULL,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SignInFailure_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "SignInFailure_createdAt_idx" ON "SignInFailure"("createdAt");

-- Server-only table: closed to Supabase's public API like every app table.
ALTER TABLE "SignInFailure" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SignInFailure" FROM anon, authenticated;
