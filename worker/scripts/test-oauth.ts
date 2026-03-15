import { acpQuery } from "../src/services/acp-client.js";

async function test() {
  console.log("Testing ACP agent query...\n");

  try {
    const result = await acpQuery({
      prompt: "Reply with exactly: ACP test successful",
    });
    console.log("Result:", result.result?.slice(0, 100));
    console.log("Stop reason:", result.stopReason);
    console.log("Usage:", result.usage);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
