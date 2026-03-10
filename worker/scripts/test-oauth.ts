import { query } from "@anthropic-ai/claude-agent-sdk";

// Remove the env var so SDK doesn't use it
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDECODE;

async function test() {
  console.log("Testing Agent SDK with settingSources: ['user']...\n");

  try {
    for await (const message of query({
      prompt: "Reply with exactly: OAuth test successful",
      options: {
        allowedTools: [],
        maxTurns: 1,
        settingSources: ["user"],
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        console.log("API Key Source:", message.apiKeySource);
      }
      if (message.type === "result") {
        console.log("Result:", message.result?.slice(0, 100));
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
