/**
 * MCP Server Service
 *
 * Manages custom MCP (Model Context Protocol) servers with validation.
 * Only HTTP Streamable transport is supported.
 *
 * Features:
 * - Server registration with URL validation
 * - Capability discovery (tools, resources)
 * - Health checking and status tracking
 * - Authentication support (bearer token, API key)
 * - Tool execution proxy
 */

import { prisma } from "../db.js";
import { encrypt, decrypt } from "@autosoftware/shared";
import { config } from "../config.js";
import type { McpServerStatus } from "../../../generated/prisma/enums.js";
import type { ToolCall } from "./mcp-tools.js";

// ============================================================================
// Types
// ============================================================================

export interface McpServerCapabilities {
  tools: McpToolDefinition[];
  resources: McpResourceDefinition[];
  prompts: McpPromptDefinition[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResourceDefinition {
  name: string;
  description: string;
  mimeTypes: string[];
}

export interface McpPromptDefinition {
  name: string;
  description: string;
  arguments: Record<string, unknown>;
}

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

export interface McpValidationResult {
  valid: boolean;
  error?: string;
  serverInfo?: McpServerInfo;
  capabilities?: McpServerCapabilities;
}

export interface McpToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALIDATION_TIMEOUT = 10000; // 10 seconds
const MCP_PROTOCOL_VERSION = "2024-11-05";

// ============================================================================
// HTTP Streamable MCP Protocol Implementation
// ============================================================================

/**
 * Send a JSON-RPC request to an MCP server using HTTP Streamable transport.
 */
async function mcpRequest(
  url: string,
  method: string,
  params: Record<string, unknown> = {},
  authHeader?: string
): Promise<unknown> {
  const requestId = crypto.randomUUID();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method,
    params,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle SSE (Server-Sent Events) response
    if (contentType.includes("text/event-stream")) {
      return await parseSSEResponse(response);
    }

    // Handle JSON response
    const json = await response.json();

    if (json.error) {
      throw new Error(json.error.message || "MCP request failed");
    }

    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse SSE (Server-Sent Events) response from MCP server.
 */
async function parseSSEResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: unknown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return result;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.result !== undefined) {
              result = parsed.result;
            }
            if (parsed.error) {
              throw new Error(parsed.error.message || "MCP request failed");
            }
          } catch {
            // Ignore parse errors for partial data
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an MCP server URL and discover its capabilities.
 * Only HTTP Streamable transport is supported.
 */
export async function validateMcpServer(
  url: string,
  authToken?: string
): Promise<McpValidationResult> {
  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Only allow HTTPS (or HTTP for localhost)
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    return { valid: false, error: "Only HTTPS URLs are allowed (HTTP allowed for localhost)" };
  }

  // Build auth header
  const authHeader = authToken ? `Bearer ${authToken}` : undefined;

  try {
    // Step 1: Initialize the connection
    const initResult = (await mcpRequest(url, "initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        roots: { listChanged: false },
      },
      clientInfo: {
        name: "AutoSoftware",
        version: "1.0.0",
      },
    })) as {
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: Record<string, unknown>;
    };

    if (!initResult?.protocolVersion) {
      return { valid: false, error: "Invalid server response: missing protocol version" };
    }

    const serverInfo: McpServerInfo = {
      name: initResult.serverInfo?.name || "Unknown",
      version: initResult.serverInfo?.version || "Unknown",
      protocolVersion: initResult.protocolVersion,
      capabilities: {
        tools: !!initResult.capabilities?.tools,
        resources: !!initResult.capabilities?.resources,
        prompts: !!initResult.capabilities?.prompts,
      },
    };

    // Step 2: Send initialized notification
    await mcpRequest(url, "notifications/initialized", {}, authHeader);

    // Step 3: Discover capabilities
    const capabilities: McpServerCapabilities = {
      tools: [],
      resources: [],
      prompts: [],
    };

    // Get tools
    if (serverInfo.capabilities.tools) {
      try {
        const toolsResult = (await mcpRequest(url, "tools/list", {}, authHeader)) as {
          tools: McpToolDefinition[];
        };
        capabilities.tools = toolsResult?.tools || [];
      } catch {
        // Tools not available
      }
    }

    // Get resources
    if (serverInfo.capabilities.resources) {
      try {
        const resourcesResult = (await mcpRequest(url, "resources/list", {}, authHeader)) as {
          resources: McpResourceDefinition[];
        };
        capabilities.resources = resourcesResult?.resources || [];
      } catch {
        // Resources not available
      }
    }

    // Get prompts
    if (serverInfo.capabilities.prompts) {
      try {
        const promptsResult = (await mcpRequest(url, "prompts/list", {}, authHeader)) as {
          prompts: McpPromptDefinition[];
        };
        capabilities.prompts = promptsResult?.prompts || [];
      } catch {
        // Prompts not available
      }
    }

    return {
      valid: true,
      serverInfo,
      capabilities,
    };
  } catch (err: any) {
    // Provide helpful error messages
    let error = err.message || "Connection failed";

    if (err.name === "AbortError") {
      error = "Connection timeout (server did not respond within 10 seconds)";
    } else if (err.code === "ECONNREFUSED") {
      error = "Connection refused (server may not be running)";
    } else if (err.code === "ENOTFOUND") {
      error = "Server not found (DNS lookup failed)";
    } else if (error.includes("401") || error.includes("403")) {
      error = "Authentication failed (check your token)";
    } else if (error.includes("404")) {
      error = "MCP endpoint not found (check the URL)";
    }

    return { valid: false, error };
  }
}

// ============================================================================
// Server Management
// ============================================================================

/**
 * Add a new custom MCP server.
 */
export async function addMcpServer(
  userId: string,
  data: {
    name: string;
    url: string;
    description?: string;
    authType?: "bearer" | "api_key" | "none";
    authToken?: string;
  }
): Promise<{ success: boolean; server?: any; error?: string }> {
  // Check if URL already exists for this user
  const existing = await prisma.mcpServer.findUnique({
    where: { userId_url: { userId, url: data.url } },
  });

  if (existing) {
    return { success: false, error: "Server with this URL already exists" };
  }

  // Validate the server
  const validation = await validateMcpServer(data.url, data.authToken);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Encrypt token if provided
  let encryptedToken: string | null = null;
  if (data.authToken && config.apiKeyEncryptionSecret) {
    encryptedToken = encrypt(data.authToken, config.apiKeyEncryptionSecret);
  }

  // Create server record
  const server = await prisma.mcpServer.create({
    data: {
      userId,
      name: data.name,
      url: data.url,
      description: data.description,
      transportType: "http-stream",
      status: "active",
      authType: data.authType || "none",
      encryptedToken,
      capabilities: (validation.capabilities || {}) as any,
      toolCount: validation.capabilities?.tools?.length || 0,
      lastTestedAt: new Date(),
    },
  });

  return { success: true, server };
}

/**
 * Update an existing MCP server.
 */
export async function updateMcpServer(
  userId: string,
  serverId: string,
  data: {
    name?: string;
    description?: string;
    isEnabled?: boolean;
    priority?: number;
    authToken?: string;
  }
): Promise<{ success: boolean; server?: any; error?: string }> {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, userId },
  });

  if (!server) {
    return { success: false, error: "Server not found" };
  }

  const updates: any = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.isEnabled !== undefined) updates.isEnabled = data.isEnabled;
  if (data.priority !== undefined) updates.priority = data.priority;

  // Update auth token if provided
  if (data.authToken !== undefined && config.apiKeyEncryptionSecret) {
    if (data.authToken) {
      updates.encryptedToken = encrypt(data.authToken, config.apiKeyEncryptionSecret);
    } else {
      updates.encryptedToken = null;
      updates.authType = "none";
    }
  }

  const updated = await prisma.mcpServer.update({
    where: { id: serverId },
    data: updates,
  });

  return { success: true, server: updated };
}

/**
 * Delete an MCP server.
 */
export async function deleteMcpServer(
  userId: string,
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await prisma.mcpServer.deleteMany({
    where: { id: serverId, userId },
  });

  if (result.count === 0) {
    return { success: false, error: "Server not found" };
  }

  return { success: true };
}

/**
 * List MCP servers for a user.
 */
export async function listMcpServers(
  userId: string,
  options: { enabledOnly?: boolean } = {}
) {
  const where: any = { userId };

  if (options.enabledOnly) {
    where.isEnabled = true;
  }

  return prisma.mcpServer.findMany({
    where,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      url: true,
      description: true,
      transportType: true,
      status: true,
      lastError: true,
      lastTestedAt: true,
      capabilities: true,
      toolCount: true,
      authType: true,
      isEnabled: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Test/revalidate an MCP server.
 */
export async function testMcpServer(
  userId: string,
  serverId: string
): Promise<McpValidationResult> {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, userId },
  });

  if (!server) {
    return { valid: false, error: "Server not found" };
  }

  // Decrypt token if present
  let authToken: string | undefined;
  if (server.encryptedToken && config.apiKeyEncryptionSecret) {
    try {
      authToken = decrypt(server.encryptedToken, config.apiKeyEncryptionSecret);
    } catch {
      // Token decryption failed
    }
  }

  const result = await validateMcpServer(server.url, authToken);

  // Update server status
  await prisma.mcpServer.update({
    where: { id: serverId },
    data: {
      status: result.valid ? "active" : "error",
      lastError: result.error || null,
      lastTestedAt: new Date(),
      capabilities: (result.capabilities || server.capabilities) as any,
      toolCount: result.capabilities?.tools?.length || server.toolCount,
    },
  });

  return result;
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Get all tools from custom MCP servers for a user.
 */
export async function getCustomMcpTools(userId: string): Promise<McpToolDefinition[]> {
  const servers = await prisma.mcpServer.findMany({
    where: { userId, isEnabled: true, status: "active" },
    orderBy: { priority: "asc" },
    select: { id: true, name: true, capabilities: true },
  });

  const tools: McpToolDefinition[] = [];

  for (const server of servers) {
    const capabilities = server.capabilities as McpServerCapabilities | null;
    if (capabilities?.tools) {
      for (const tool of capabilities.tools) {
        // Prefix tool name with server name to avoid conflicts
        tools.push({
          ...tool,
          name: `${server.name}__${tool.name}`,
          description: `[${server.name}] ${tool.description}`,
        });
      }
    }
  }

  return tools;
}

/**
 * Execute a tool on a custom MCP server.
 */
export async function executeCustomMcpTool(
  userId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolCall> {
  const id = crypto.randomUUID();
  const start = Date.now();

  // Parse server name from tool name (format: servername__toolname)
  const [serverName, actualToolName] = toolName.split("__");

  if (!serverName || !actualToolName) {
    return {
      id,
      name: toolName,
      input,
      output: null,
      duration: Date.now() - start,
      error: "Invalid tool name format",
    };
  }

  // Find the server
  const server = await prisma.mcpServer.findFirst({
    where: { userId, name: serverName, isEnabled: true, status: "active" },
  });

  if (!server) {
    return {
      id,
      name: toolName,
      input,
      output: null,
      duration: Date.now() - start,
      error: `MCP server "${serverName}" not found or not active`,
    };
  }

  // Decrypt token if present
  let authHeader: string | undefined;
  if (server.encryptedToken && config.apiKeyEncryptionSecret) {
    try {
      const token = decrypt(server.encryptedToken, config.apiKeyEncryptionSecret);
      authHeader = `Bearer ${token}`;
    } catch {
      // Token decryption failed
    }
  }

  try {
    const result = await mcpRequest(
      server.url,
      "tools/call",
      { name: actualToolName, arguments: input },
      authHeader
    );

    return {
      id,
      name: toolName,
      input,
      output: result,
      duration: Date.now() - start,
    };
  } catch (err: any) {
    // Update server status on failure
    await prisma.mcpServer.update({
      where: { id: server.id },
      data: {
        lastError: err.message,
        lastTestedAt: new Date(),
      },
    });

    return {
      id,
      name: toolName,
      input,
      output: null,
      duration: Date.now() - start,
      error: err.message || "Tool execution failed",
    };
  }
}
