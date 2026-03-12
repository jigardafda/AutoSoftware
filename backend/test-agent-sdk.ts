/**
 * Test Agent SDK Chat Integration
 */

import { prisma } from "./src/db.js";
import { createConversation, streamChat, buildChatContext } from "./src/services/chat-service.js";

async function main() {
  console.log("🧪 Testing Agent SDK Chat Integration\n");

  // Check if running inside Claude Code (nested sessions not allowed)
  const isNestedSession = !!process.env.CLAUDECODE;
  if (isNestedSession) {
    console.log("⚠️  Running inside Claude Code session - skipping agent query test");
    console.log("   (The Agent SDK spawns Claude as a subprocess, which cannot be nested)");
    console.log("   To test fully, run this from a regular terminal:\n");
    console.log("   cd backend && npx tsx test-agent-sdk.ts\n");
  }

  // 1. Setup test user
  console.log("1️⃣ Setting up test user...");
  let testUser = await prisma.user.findUnique({
    where: { email: "test-agent-sdk@example.com" },
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: "test-agent-sdk@example.com",
        name: "Agent SDK Tester",
      },
    });
    console.log("   ✅ Created test user:", testUser.id);
  } else {
    console.log("   ✅ Using existing test user:", testUser.id);
  }

  // 2. Create a conversation
  console.log("\n2️⃣ Creating conversation...");
  const conversationId = await createConversation(testUser.id, "global");
  console.log("   ✅ Created conversation:", conversationId);

  // 3. Build chat context
  console.log("\n3️⃣ Building chat context...");
  const context = await buildChatContext(testUser.id, "global");
  console.log("   ✅ Context:", {
    type: context.contextType,
    tasks: context.recentTasks?.length || 0,
  });

  // 4. Test streaming chat with Agent SDK
  console.log("\n4️⃣ Testing chat with Agent SDK + MCP tools...");

  if (isNestedSession) {
    console.log("   ⏭️  Skipped (nested session - run from regular terminal to test)");
  } else {
    console.log('   Sending: "Hello! List my repositories"\n');

    const startTime = Date.now();
    let responseText = "";
    let chunkCount = 0;
    let hasToolUse = false;

    try {
      for await (const chunk of streamChat(
        testUser.id,
        conversationId,
        "Hello! What can you help me with? Can you list my repositories?",
        {}
      )) {
        chunkCount++;

        switch (chunk.type) {
          case "text":
            if (chunk.text) {
              process.stdout.write(chunk.text);
              responseText += chunk.text;
            }
            break;
          case "tool_start":
            hasToolUse = true;
            console.log(`\n\n   🔧 Tool: ${chunk.toolCall?.name}`);
            break;
          case "tool_end":
            console.log(`   ✅ Tool completed: ${chunk.toolCall?.name}`);
            break;
          case "done":
            console.log(`\n\n   📊 Tokens: ~${chunk.usage?.inputTokens} in, ~${chunk.usage?.outputTokens} out`);
            console.log(`   💵 Cost: $${chunk.usage?.costUsd?.toFixed(6)}`);
            break;
          case "error":
            console.log(`\n\n   ❌ Error: ${chunk.error}`);
            break;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`\n   ⏱️ Duration: ${duration}ms`);
      console.log(`   📝 Chunks: ${chunkCount}`);
      console.log(`   📏 Response: ${responseText.length} chars`);
      console.log(`   🔧 Tools used: ${hasToolUse ? "Yes" : "No"}`);
    } catch (error: any) {
      console.log(`\n   ❌ Error: ${error.message}`);
      if (error.stack) {
        console.log("   Stack:", error.stack.split("\n").slice(0, 3).join("\n   "));
      }
    }
  }

  // 5. Cleanup
  console.log("\n5️⃣ Cleaning up...");
  await prisma.chatMessage.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } });
  console.log("   ✅ Cleaned up");

  console.log("\n✅ Test complete!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Test failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
