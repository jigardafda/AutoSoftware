-- CreateEnum
CREATE TYPE "ConversationContextType" AS ENUM ('global', 'project', 'repository');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "ChatArtifactType" AS ENUM ('html', 'react', 'svg', 'code', 'markdown', 'mermaid', 'json');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "contextType" "ConversationContextType" NOT NULL DEFAULT 'global',
    "contextId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "attachments" JSONB,
    "voiceInput" BOOLEAN NOT NULL DEFAULT false,
    "voiceDuration" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "feedback" TEXT,
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatArtifact" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "ChatArtifactType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "previewUrl" TEXT,
    "taskId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushToTalk" BOOLEAN NOT NULL DEFAULT true,
    "autoSendDelay" INTEGER NOT NULL DEFAULT 2000,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "ttsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ttsVoice" TEXT NOT NULL DEFAULT 'default',
    "ttsSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ttsVolume" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_contextType_contextId_idx" ON "Conversation"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatArtifact_messageId_idx" ON "ChatArtifact"("messageId");

-- CreateIndex
CREATE INDEX "ChatArtifact_taskId_idx" ON "ChatArtifact"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceSettings_userId_key" ON "VoiceSettings"("userId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatArtifact" ADD CONSTRAINT "ChatArtifact_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatArtifact" ADD CONSTRAINT "ChatArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSettings" ADD CONSTRAINT "VoiceSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
