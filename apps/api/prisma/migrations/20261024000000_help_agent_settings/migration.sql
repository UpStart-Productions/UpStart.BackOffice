-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GEMINI');

-- CreateTable
CREATE TABLE "HelpAgentSettings" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'ANTHROPIC',
    "model" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "keyLastFour" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpAgentSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HelpAgentSettings" ADD CONSTRAINT "HelpAgentSettings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
