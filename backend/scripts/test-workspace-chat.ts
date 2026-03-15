#!/usr/bin/env npx tsx
/**
 * End-to-end test for the workspace chat flow.
 * Tests: session creation, message sending, WebSocket streaming, event buffering,
 * message persistence, and multi-turn conversation.
 *
 * Usage: npx tsx backend/scripts/test-workspace-chat.ts
 *
 * Prerequisites:
 *   - Backend running on port 5002
 *   - A workspace must exist (the test will find one or create one)
 *   - Claude Code CLI must be installed
 */

const API = "http://localhost:5002/api";
const WS_URL = "ws://localhost:5002";

// Generate auth cookie using HMAC-SHA256 (same as Fastify cookie signing)
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-to-random-string";

async function getAuthCookie(): Promise<string> {
  // Try local mode first
  const configRes = await fetch(`${API}/config`);
  const config = await configRes.json();
  if (config.localMode) {
    console.log("  Local mode detected — no auth cookie needed");
    return "";
  }

  // Find user from DB and sign cookie
  const pg = await import("pg");
  const dbUrl = process.env.DATABASE_URL || "postgresql://yugabyte:yugabyte@localhost:5432/autosoftware?schema=public";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const result = await client.query('SELECT id, name FROM "User" LIMIT 1');
  await client.end();

  if (result.rows.length === 0) throw new Error("No users in DB");
  const userId = result.rows[0].id;
  console.log(`  User: ${result.rows[0].name} (${userId})`);

  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(userId).digest("base64").replace(/=+$/g, "");
  return `session_token=${userId}.${sig}`;
}

let authCookie = "";

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (authCookie) {
    headers["Cookie"] = authCookie;
  }
  const res = await fetch(url, { ...options, headers });
  return res;
}

// Find or verify a workspace exists
async function findWorkspace(): Promise<any> {
  const res = await fetchWithAuth(`${API}/workspaces`);
  const data = await res.json();
  const workspaces = data.workspaces || data.data?.workspaces || [];
  if (workspaces.length === 0) {
    throw new Error("No workspaces found. Please create one first via the UI.");
  }
  return workspaces[0];
}

// Create a new session
async function createSession(workspaceId: string): Promise<string> {
  const res = await fetchWithAuth(`${API}/workspaces/${workspaceId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to create session: ${JSON.stringify(data)}`);
  return data.session.id;
}

// Send a message
async function sendMessage(
  workspaceId: string,
  sessionId: string,
  content: string,
  acpSessionId?: string,
  attachments?: any[]
): Promise<{ ok: boolean; acpSessionId: string }> {
  const res = await fetchWithAuth(`${API}/workspaces/${workspaceId}/sessions/${sessionId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, acpSessionId, attachments }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to send message: ${JSON.stringify(data)}`);
  return data;
}

// Connect WebSocket and collect events
async function connectWebSocket(
  workspaceId: string,
  acpSessionId: string
): Promise<{ events: any[]; close: () => void }> {
  const { default: WebSocket } = await import("ws");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/workspace/${workspaceId}`);
    const events: any[] = [];

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", acpSessionId }));
      resolve({
        events,
        close: () => ws.close(),
      });
    });

    ws.on("message", (data: any) => {
      try {
        const event = JSON.parse(data.toString());
        events.push(event);
      } catch {}
    });

    ws.on("error", (err: Error) => reject(err));

    setTimeout(() => {
      reject(new Error("WebSocket connection timeout"));
    }, 5000);
  });
}

// Wait for events to include a specific type
async function waitForEvent(
  events: any[],
  type: string,
  timeoutMs: number = 60000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = events.find((e) => e.type === type);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for event "${type}" (${timeoutMs}ms). Got: ${events.map(e => e.type).join(", ")}`);
}

// Wait for turn_complete event
async function waitForTurnComplete(events: any[], timeoutMs: number = 120000): Promise<void> {
  await waitForEvent(events, "turn_complete", timeoutMs);
}

// Fetch workspace with sessions and messages
async function fetchWorkspaceDetail(workspaceId: string): Promise<any> {
  const res = await fetchWithAuth(`${API}/workspaces/${workspaceId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to fetch workspace: ${JSON.stringify(data)}`);
  return data.workspace;
}

// ─── Main Test ───

async function main() {
  console.log("=== Workspace Chat E2E Test ===\n");

  // Step 1: Auth check
  console.log("1. Checking auth...");
  authCookie = await getAuthCookie();

  // Step 2: Find workspace
  console.log("2. Finding workspace...");
  const workspace = await findWorkspace();
  console.log(`  Found: "${workspace.name}" (${workspace.id})`);
  console.log(`  Agent: ${workspace.agentId}`);
  console.log(`  Path: ${workspace.worktreePath || workspace.localPath || "none"}`);

  if (!workspace.worktreePath && !workspace.localPath) {
    throw new Error("Workspace has no working directory. Please set one up first.");
  }

  // Step 3: Create session
  console.log("\n3. Creating session...");
  const sessionId = await createSession(workspace.id);
  console.log(`  Session ID: ${sessionId}`);

  // Step 4: Send first message and get ACP session ID
  console.log("\n4. Sending first message...");
  const result = await sendMessage(
    workspace.id,
    sessionId,
    'Respond with exactly: "Hello from test! The chat is working." Do not use any tools. Just respond with that exact text.'
  );
  console.log(`  ACP Session ID: ${result.acpSessionId}`);

  // Step 5: Connect WebSocket (should replay buffered events)
  console.log("\n5. Connecting WebSocket...");
  const { events, close } = await connectWebSocket(workspace.id, result.acpSessionId!);
  console.log("  Connected!");

  // Check if we received replay events (buffered before WS connected)
  await new Promise((r) => setTimeout(r, 1000));
  const replayCount = events.length;
  console.log(`  Replayed ${replayCount} buffered events: ${events.map(e => e.type).join(", ")}`);

  // Step 6: Wait for agent to complete
  console.log("\n6. Waiting for agent to complete...");
  try {
    await waitForTurnComplete(events, 120000);
    console.log("  Agent turn completed!");
  } catch (err) {
    console.log(`  Warning: ${(err as Error).message}`);
  }

  // Step 7: Analyze received events
  console.log("\n7. Event summary:");
  const typeCounts: Record<string, number> = {};
  for (const event of events) {
    typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  // Check for critical event types
  const hasSystem = events.some((e) => e.type === "system");
  const hasMessage = events.some((e) => e.type === "agent_message_chunk");
  const hasUsage = events.some((e) => e.type === "usage_update");
  const hasTurnComplete = events.some((e) => e.type === "turn_complete");

  console.log("\n  Critical events present:");
  console.log(`  system (init):      ${hasSystem ? "YES" : "NO"}`);
  console.log(`  agent_message_chunk: ${hasMessage ? "YES" : "NO"}`);
  console.log(`  usage_update:       ${hasUsage ? "YES" : "NO"}`);
  console.log(`  turn_complete:      ${hasTurnComplete ? "YES" : "NO"}`);

  // Print agent response text
  const messageChunks = events
    .filter((e) => e.type === "agent_message_chunk")
    .map((e) => (e.data as any)?.text || "");
  const fullResponse = messageChunks.join("");
  if (fullResponse) {
    console.log(`\n  Agent response: "${fullResponse.slice(0, 200)}${fullResponse.length > 200 ? "..." : ""}"`);
  }

  // Step 8: Verify DB persistence
  console.log("\n8. Checking DB persistence...");
  // Wait a moment for DB writes to complete
  await new Promise((r) => setTimeout(r, 2000));
  const detail = await fetchWorkspaceDetail(workspace.id);
  const session = detail.sessions?.find((s: any) => s.id === sessionId);
  if (session?.messages?.length) {
    console.log(`  Messages in DB: ${session.messages.length}`);
    for (const msg of session.messages) {
      const preview = msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content;
      console.log(`    [${msg.role}] ${preview}`);
    }
  } else {
    console.log("  WARNING: No messages found in DB!");
  }

  // Step 9: Test multi-turn (follow-up message)
  if (hasTurnComplete) {
    console.log("\n9. Testing multi-turn (follow-up message)...");
    // Clear events for second turn
    events.length = 0;

    const result2 = await sendMessage(
      workspace.id,
      sessionId,
      'Now respond with exactly: "Follow-up received!" Do not use any tools.',
      result.acpSessionId
    );
    console.log(`  Follow-up sent (acpSessionId: ${result2.acpSessionId})`);

    try {
      await waitForTurnComplete(events, 120000);
      console.log("  Follow-up turn completed!");

      const chunks2 = events
        .filter((e) => e.type === "agent_message_chunk")
        .map((e) => (e.data as any)?.text || "");
      const response2 = chunks2.join("");
      if (response2) {
        console.log(`  Follow-up response: "${response2.slice(0, 200)}"`);
      }
    } catch (err) {
      console.log(`  Warning: ${(err as Error).message}`);
    }
  }

  // Step 10: Final DB check
  console.log("\n10. Final DB check...");
  await new Promise((r) => setTimeout(r, 2000));
  const finalDetail = await fetchWorkspaceDetail(workspace.id);
  const finalSession = finalDetail.sessions?.find((s: any) => s.id === sessionId);
  if (finalSession?.messages?.length) {
    console.log(`  Total messages in DB: ${finalSession.messages.length}`);
    const roles = finalSession.messages.map((m: any) => m.role);
    const roleCounts: Record<string, number> = {};
    for (const role of roles) {
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    }
    console.log("  By role:", JSON.stringify(roleCounts));
  }

  close();

  console.log("\n=== Test Complete ===");

  // Summary
  const passed = hasMessage && hasTurnComplete;
  console.log(passed ? "\nRESULT: PASS" : "\nRESULT: FAIL");
  if (!passed) {
    if (!hasMessage) console.log("  MISSING: agent_message_chunk events — agent may not be streaming");
    if (!hasTurnComplete) console.log("  MISSING: turn_complete event — agent may not have finished");
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFATAL ERROR:", err.message);
  process.exit(1);
});
