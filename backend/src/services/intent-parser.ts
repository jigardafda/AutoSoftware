/**
 * Intent Parser Service
 *
 * AI-powered natural language understanding for task descriptions.
 * Parses plain English task descriptions into structured task intents.
 *
 * Features:
 * - Extract task type (bugfix, feature, refactor, etc.)
 * - Extract priority hints ("urgent", "when you have time", etc.)
 * - Extract file/component references
 * - Infer scope from vague requests (e.g., "fix the login" -> auth/login components)
 * - Understand references like "fix it like we did in X" by searching history
 */

import { prisma } from "../db.js";
import {
  resolveAuth,
  setupAgentSdkAuth,
  isValidAuth,
  simpleQuery,
} from "./claude-query.js";
import type { TaskType, TaskPriority } from "@autosoftware/shared";
import { findSimilarTasks, type SimilarTask } from "./task-similarity.js";

// ============================================================================
// Types
// ============================================================================

export interface ParsedIntent {
  // Core task properties
  taskType: TaskType;
  priority: TaskPriority;
  confidence: number;

  // Extracted entities
  title: string;
  description: string;
  components: ComponentReference[];
  filePatterns: string[];

  // Context references
  historyReferences: HistoryReference[];
  relatedTasks: SimilarTask[];

  // Scope inference
  inferredScope: ScopeInference;

  // Raw extraction data
  keywords: ExtractedKeyword[];
  entities: ExtractedEntity[];

  // Parsing metadata
  parseMetadata: ParseMetadata;
}

export interface ComponentReference {
  name: string;
  type: "file" | "directory" | "component" | "module" | "service" | "api" | "unknown";
  confidence: number;
  suggestedPaths: string[];
}

export interface HistoryReference {
  type: "task" | "commit" | "pr" | "issue";
  reference: string;
  resolvedId?: string;
  context: string;
}

export interface ScopeInference {
  areas: string[];
  estimatedComplexity: "trivial" | "small" | "medium" | "large" | "xlarge";
  suggestedFiles: string[];
  relatedDomains: string[];
}

export interface ExtractedKeyword {
  keyword: string;
  category: "action" | "target" | "modifier" | "context";
  weight: number;
}

export interface ExtractedEntity {
  text: string;
  type: "file" | "function" | "class" | "variable" | "url" | "error" | "technology";
  startIndex: number;
  endIndex: number;
}

export interface ParseMetadata {
  originalInput: string;
  processingTimeMs: number;
  aiModelUsed: string;
  fallbackUsed: boolean;
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

// Priority indicators in natural language
const PRIORITY_INDICATORS: Record<TaskPriority, string[]> = {
  critical: [
    "critical", "emergency", "urgent asap", "production down", "p0", "sev0",
    "blocking", "hotfix", "immediately", "right now", "drop everything",
    "show stopper", "showstopper", "production issue", "outage"
  ],
  high: [
    "urgent", "high priority", "asap", "important", "p1", "sev1",
    "priority", "needed soon", "time sensitive", "pressing", "crucial"
  ],
  medium: [
    "medium", "normal", "standard", "p2", "sev2", "when possible",
    "soon", "moderate", "regular"
  ],
  low: [
    "low priority", "whenever", "when you have time", "no rush", "p3", "p4",
    "nice to have", "eventually", "backlog", "someday", "not urgent",
    "low", "minor"
  ],
};

// Task type indicators
const TASK_TYPE_INDICATORS: Record<TaskType, string[]> = {
  bugfix: [
    "bug", "fix", "broken", "error", "issue", "problem", "crash", "failing",
    "doesn't work", "not working", "incorrect", "wrong", "exception",
    "regression", "defect", "malfunction", "glitch"
  ],
  feature: [
    "feature", "add", "new", "implement", "create", "build", "introduce",
    "enable", "support", "capability", "functionality", "enhancement",
    "develop"
  ],
  improvement: [
    "improve", "enhance", "better", "optimize", "update", "upgrade",
    "polish", "tweak", "adjust", "modernize", "cleanup", "clean up"
  ],
  refactor: [
    "refactor", "restructure", "reorganize", "rewrite", "simplify",
    "extract", "consolidate", "decouple", "modularize", "rename",
    "move", "split", "merge", "abstract"
  ],
  security: [
    "security", "vulnerability", "secure", "cve", "exploit", "auth",
    "authentication", "authorization", "permission", "access control",
    "injection", "xss", "csrf", "sanitize", "encrypt", "decrypt"
  ],
};

// Common component patterns for scope inference
const COMPONENT_PATTERNS: Record<string, string[]> = {
  auth: ["login", "logout", "auth", "authentication", "signin", "signup", "register", "password", "session", "token", "jwt", "oauth"],
  api: ["api", "endpoint", "route", "rest", "graphql", "controller", "handler", "middleware"],
  database: ["database", "db", "query", "migration", "schema", "model", "orm", "prisma", "sql"],
  ui: ["ui", "component", "button", "form", "modal", "dialog", "input", "page", "view", "screen", "layout"],
  testing: ["test", "spec", "unit test", "integration test", "e2e", "coverage", "mock", "fixture"],
  config: ["config", "configuration", "settings", "env", "environment", ".env", "yaml", "json"],
  build: ["build", "deploy", "ci", "cd", "pipeline", "docker", "webpack", "vite", "bundle"],
  docs: ["documentation", "docs", "readme", "comment", "jsdoc", "typedoc"],
};

// ============================================================================
// Intent Parser Service
// ============================================================================

/**
 * Parse a natural language task description into structured intent
 */
export async function parseTaskIntent(
  userId: string,
  repositoryId: string,
  naturalLanguageInput: string,
  projectId?: string
): Promise<ParsedIntent> {
  const startTime = Date.now();
  const warnings: string[] = [];

  // Quick validation
  if (!naturalLanguageInput || naturalLanguageInput.trim().length < 3) {
    throw new Error("Task description is too short");
  }

  const input = naturalLanguageInput.trim();

  // Step 1: Extract keywords and basic entities using rules
  const keywords = extractKeywords(input);
  const entities = extractEntities(input);

  // Step 2: Determine task type and priority from indicators
  const { taskType, typeConfidence } = inferTaskType(input, keywords);
  const { priority, priorityConfidence } = inferPriority(input, keywords);

  // Step 3: Extract component references
  const components = await extractComponentReferences(userId, repositoryId, input, entities);

  // Step 4: Find history references (e.g., "like we did in PR #123")
  const historyReferences = extractHistoryReferences(input);

  // Step 5: Find similar past tasks
  let relatedTasks: SimilarTask[] = [];
  try {
    relatedTasks = await findSimilarTasks(userId, repositoryId, input, projectId);
  } catch (err) {
    warnings.push(`Failed to find similar tasks: ${err instanceof Error ? err.message : "Unknown error"}`);
  }

  // Step 6: Infer scope
  const inferredScope = await inferScope(userId, repositoryId, input, components, entities);

  // Step 7: Use AI to enhance parsing (if available)
  let aiEnhanced = false;
  let title = generateTitle(input, keywords, taskType);
  let description = input;

  const auth = await resolveAuth(userId);
  if (isValidAuth(auth)) {
    setupAgentSdkAuth(auth);
    try {
      const aiResult = await enhanceWithAI(input, {
        taskType,
        priority,
        components,
        inferredScope,
        historyReferences,
        relatedTasks,
      });
      if (aiResult) {
        title = aiResult.title || title;
        description = aiResult.enhancedDescription || description;
        aiEnhanced = true;

        // Merge AI-detected components
        if (aiResult.additionalComponents) {
          for (const comp of aiResult.additionalComponents) {
            if (!components.find((c) => c.name === comp.name)) {
              components.push(comp);
            }
          }
        }

        // Update scope if AI provided better inference
        if (aiResult.scopeRefinement) {
          inferredScope.areas = [...new Set([...inferredScope.areas, ...aiResult.scopeRefinement.areas])];
          inferredScope.suggestedFiles = [...new Set([...inferredScope.suggestedFiles, ...(aiResult.scopeRefinement.suggestedFiles || [])])];
        }
      }
    } catch (err) {
      warnings.push(`AI enhancement failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Calculate overall confidence
  const confidence = calculateConfidence(typeConfidence, priorityConfidence, aiEnhanced, components.length, relatedTasks.length);

  // Extract file patterns from components and entities
  const filePatterns = extractFilePatterns(components, entities, inferredScope);

  return {
    taskType,
    priority,
    confidence,
    title,
    description,
    components,
    filePatterns,
    historyReferences,
    relatedTasks,
    inferredScope,
    keywords,
    entities,
    parseMetadata: {
      originalInput: input,
      processingTimeMs: Date.now() - startTime,
      aiModelUsed: aiEnhanced ? "claude-sonnet-4-20250514" : "none",
      fallbackUsed: !aiEnhanced,
      warnings,
    },
  };
}

// ============================================================================
// Keyword Extraction
// ============================================================================

function extractKeywords(input: string): ExtractedKeyword[] {
  const keywords: ExtractedKeyword[] = [];
  const words = input.toLowerCase().split(/\s+/);

  // Action words
  const actionWords = ["fix", "add", "remove", "update", "change", "create", "delete", "modify", "implement", "refactor", "optimize", "improve", "debug", "test", "deploy", "migrate", "upgrade"];
  for (const word of words) {
    if (actionWords.includes(word)) {
      keywords.push({ keyword: word, category: "action", weight: 1.0 });
    }
  }

  // Modifier words
  const modifierWords = ["all", "some", "every", "multiple", "single", "entire", "partial", "related", "similar", "same", "different", "new", "old", "current", "previous"];
  for (const word of words) {
    if (modifierWords.includes(word)) {
      keywords.push({ keyword: word, category: "modifier", weight: 0.5 });
    }
  }

  // Context words (from component patterns)
  for (const [domain, patterns] of Object.entries(COMPONENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (input.toLowerCase().includes(pattern)) {
        keywords.push({ keyword: pattern, category: "context", weight: 0.8 });
      }
    }
  }

  return keywords;
}

// ============================================================================
// Entity Extraction
// ============================================================================

function extractEntities(input: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // File patterns (e.g., "src/components/Button.tsx", "utils.js")
  const filePattern = /(?:^|[\s"'`])([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|rb|go|rs|java|css|scss|json|yaml|yml|md|html|vue|svelte))/g;
  let match;
  while ((match = filePattern.exec(input)) !== null) {
    entities.push({
      text: match[1],
      type: "file",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Function/method patterns (e.g., "handleSubmit()", "getUserById")
  const funcPattern = /\b([a-z][a-zA-Z0-9_]*(?:\.(?:[a-z][a-zA-Z0-9_]*))*)\s*\(\)/g;
  while ((match = funcPattern.exec(input)) !== null) {
    entities.push({
      text: match[1],
      type: "function",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Class/Component patterns (e.g., "UserService", "LoginButton")
  const classPattern = /\b([A-Z][a-zA-Z0-9]*(?:Service|Controller|Component|Provider|Handler|Manager|Factory|Repository|Model|Entity|DTO))\b/g;
  while ((match = classPattern.exec(input)) !== null) {
    entities.push({
      text: match[1],
      type: "class",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Error patterns
  const errorPattern = /\b(Error|Exception|TypeError|ReferenceError|SyntaxError|ValidationError|[A-Z][a-zA-Z]*Error)\b/g;
  while ((match = errorPattern.exec(input)) !== null) {
    entities.push({
      text: match[1],
      type: "error",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // URL patterns
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  while ((match = urlPattern.exec(input)) !== null) {
    entities.push({
      text: match[1],
      type: "url",
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Technology names
  const techNames = ["react", "vue", "angular", "typescript", "javascript", "python", "node", "express", "fastify", "prisma", "postgresql", "mongodb", "redis", "docker", "kubernetes", "aws", "gcp", "azure", "graphql", "rest", "websocket", "tailwind", "css", "sass", "webpack", "vite", "eslint", "prettier", "jest", "vitest", "playwright", "cypress"];
  const lowerInput = input.toLowerCase();
  for (const tech of techNames) {
    const idx = lowerInput.indexOf(tech);
    if (idx !== -1) {
      entities.push({
        text: tech,
        type: "technology",
        startIndex: idx,
        endIndex: idx + tech.length,
      });
    }
  }

  return entities;
}

// ============================================================================
// Task Type and Priority Inference
// ============================================================================

function inferTaskType(input: string, keywords: ExtractedKeyword[]): { taskType: TaskType; typeConfidence: number } {
  const lowerInput = input.toLowerCase();
  const scores: Record<TaskType, number> = {
    bugfix: 0,
    feature: 0,
    improvement: 0,
    refactor: 0,
    security: 0,
  };

  // Score based on indicators
  for (const [type, indicators] of Object.entries(TASK_TYPE_INDICATORS)) {
    for (const indicator of indicators) {
      if (lowerInput.includes(indicator)) {
        scores[type as TaskType] += indicator.split(" ").length; // Multi-word indicators score higher
      }
    }
  }

  // Boost from action keywords
  for (const kw of keywords.filter((k) => k.category === "action")) {
    if (["fix", "debug"].includes(kw.keyword)) scores.bugfix += 0.5;
    if (["add", "create", "implement", "build"].includes(kw.keyword)) scores.feature += 0.5;
    if (["improve", "optimize", "update"].includes(kw.keyword)) scores.improvement += 0.5;
    if (["refactor", "restructure", "reorganize"].includes(kw.keyword)) scores.refactor += 0.5;
  }

  // Find highest score
  let maxType: TaskType = "improvement";
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as TaskType;
    }
  }

  // Calculate confidence (normalize to 0-1)
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(maxScore / totalScore, 1) : 0.3;

  return { taskType: maxType, typeConfidence: confidence };
}

function inferPriority(input: string, keywords: ExtractedKeyword[]): { priority: TaskPriority; priorityConfidence: number } {
  const lowerInput = input.toLowerCase();

  // Check priority indicators in order (critical first)
  for (const [priority, indicators] of Object.entries(PRIORITY_INDICATORS)) {
    for (const indicator of indicators) {
      if (lowerInput.includes(indicator)) {
        return { priority: priority as TaskPriority, priorityConfidence: 0.8 };
      }
    }
  }

  // Default to medium with lower confidence
  return { priority: "medium", priorityConfidence: 0.4 };
}

// ============================================================================
// Component Reference Extraction
// ============================================================================

async function extractComponentReferences(
  userId: string,
  repositoryId: string,
  input: string,
  entities: ExtractedEntity[]
): Promise<ComponentReference[]> {
  const components: ComponentReference[] = [];
  const lowerInput = input.toLowerCase();

  // Extract from entities
  for (const entity of entities) {
    if (entity.type === "file") {
      components.push({
        name: entity.text,
        type: "file",
        confidence: 0.9,
        suggestedPaths: [entity.text],
      });
    } else if (entity.type === "class") {
      components.push({
        name: entity.text,
        type: "component",
        confidence: 0.7,
        suggestedPaths: [],
      });
    } else if (entity.type === "function") {
      components.push({
        name: entity.text,
        type: "module",
        confidence: 0.6,
        suggestedPaths: [],
      });
    }
  }

  // Extract from component patterns
  for (const [domain, patterns] of Object.entries(COMPONENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerInput.includes(pattern)) {
        // Check if not already added
        if (!components.find((c) => c.name.toLowerCase() === pattern)) {
          let componentType: ComponentReference["type"] = "unknown";
          if (domain === "api") componentType = "api";
          else if (domain === "ui") componentType = "component";
          else if (["auth", "database"].includes(domain)) componentType = "service";
          else componentType = "module";

          components.push({
            name: pattern,
            type: componentType,
            confidence: 0.5,
            suggestedPaths: [],
          });
        }
      }
    }
  }

  // Try to resolve paths from repository conventions
  try {
    const convention = await prisma.projectConvention.findFirst({
      where: { repositoryId },
    });

    if (convention) {
      const frameworkPatterns = convention.frameworkPatterns as any[];
      for (const component of components) {
        if (component.suggestedPaths.length === 0 && frameworkPatterns) {
          // Try to match component to known patterns
          for (const pattern of frameworkPatterns) {
            if (pattern.path && pattern.name?.toLowerCase().includes(component.name.toLowerCase())) {
              component.suggestedPaths.push(pattern.path);
            }
          }
        }
      }
    }
  } catch {
    // Continue without convention data
  }

  return components;
}

// ============================================================================
// History Reference Extraction
// ============================================================================

function extractHistoryReferences(input: string): HistoryReference[] {
  const references: HistoryReference[] = [];

  // PR references (e.g., "PR #123", "pull request 456")
  const prPattern = /(?:pr|pull request|pull)\s*#?(\d+)/gi;
  let match;
  while ((match = prPattern.exec(input)) !== null) {
    references.push({
      type: "pr",
      reference: `#${match[1]}`,
      context: extractContext(input, match.index, 50),
    });
  }

  // Issue references (e.g., "issue #123", "#456")
  const issuePattern = /(?:issue|ticket|bug)\s*#?(\d+)|#(\d+)/gi;
  while ((match = issuePattern.exec(input)) !== null) {
    const num = match[1] || match[2];
    references.push({
      type: "issue",
      reference: `#${num}`,
      context: extractContext(input, match.index, 50),
    });
  }

  // Commit references (e.g., "commit abc123", "sha 1234567")
  const commitPattern = /(?:commit|sha|rev)\s+([a-f0-9]{7,40})/gi;
  while ((match = commitPattern.exec(input)) !== null) {
    references.push({
      type: "commit",
      reference: match[1],
      context: extractContext(input, match.index, 50),
    });
  }

  // "like we did in X" patterns
  const likePattern = /like\s+(?:we\s+)?(?:did\s+)?(?:in|with|for)\s+([^,.]+)/gi;
  while ((match = likePattern.exec(input)) !== null) {
    references.push({
      type: "task",
      reference: match[1].trim(),
      context: extractContext(input, match.index, 80),
    });
  }

  // "similar to X" patterns
  const similarPattern = /similar\s+to\s+([^,.]+)/gi;
  while ((match = similarPattern.exec(input)) !== null) {
    references.push({
      type: "task",
      reference: match[1].trim(),
      context: extractContext(input, match.index, 80),
    });
  }

  return references;
}

function extractContext(input: string, index: number, contextLength: number): string {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(input.length, index + contextLength);
  return input.slice(start, end).trim();
}

// ============================================================================
// Scope Inference
// ============================================================================

async function inferScope(
  userId: string,
  repositoryId: string,
  input: string,
  components: ComponentReference[],
  entities: ExtractedEntity[]
): Promise<ScopeInference> {
  const areas: string[] = [];
  const suggestedFiles: string[] = [];
  const relatedDomains: string[] = [];
  const lowerInput = input.toLowerCase();

  // Determine affected areas from component patterns
  for (const [domain, patterns] of Object.entries(COMPONENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerInput.includes(pattern)) {
        if (!areas.includes(domain)) {
          areas.push(domain);
        }
      }
    }
  }

  // Add from components
  for (const comp of components) {
    if (comp.suggestedPaths) {
      suggestedFiles.push(...comp.suggestedPaths);
    }
    // Infer domain from component type
    if (comp.type === "api") relatedDomains.push("backend");
    if (comp.type === "component") relatedDomains.push("frontend");
    if (comp.type === "service") relatedDomains.push("services");
  }

  // Add from file entities
  for (const entity of entities.filter((e) => e.type === "file")) {
    suggestedFiles.push(entity.text);
  }

  // Estimate complexity based on indicators
  const complexity = estimateComplexity(input, components, areas);

  return {
    areas: [...new Set(areas)],
    estimatedComplexity: complexity,
    suggestedFiles: [...new Set(suggestedFiles)],
    relatedDomains: [...new Set(relatedDomains)],
  };
}

function estimateComplexity(
  input: string,
  components: ComponentReference[],
  areas: string[]
): ScopeInference["estimatedComplexity"] {
  const lowerInput = input.toLowerCase();

  // Check for complexity indicators
  const trivialIndicators = ["typo", "spelling", "rename", "comment", "quick"];
  const largeIndicators = ["entire", "complete", "all", "rewrite", "major", "overhaul", "redesign", "architecture"];
  const xlargeIndicators = ["system", "migration", "platform", "infrastructure", "breaking"];

  if (xlargeIndicators.some((i) => lowerInput.includes(i))) {
    return "xlarge";
  }
  if (largeIndicators.some((i) => lowerInput.includes(i)) || areas.length > 3) {
    return "large";
  }
  if (components.length > 5 || areas.length > 2) {
    return "medium";
  }
  if (trivialIndicators.some((i) => lowerInput.includes(i))) {
    return "trivial";
  }
  if (components.length <= 2 && areas.length <= 1) {
    return "small";
  }

  return "medium";
}

// ============================================================================
// AI Enhancement
// ============================================================================

interface AIEnhancementResult {
  title?: string;
  enhancedDescription?: string;
  additionalComponents?: ComponentReference[];
  scopeRefinement?: {
    areas: string[];
    suggestedFiles?: string[];
  };
}

async function enhanceWithAI(
  input: string,
  context: {
    taskType: TaskType;
    priority: TaskPriority;
    components: ComponentReference[];
    inferredScope: ScopeInference;
    historyReferences: HistoryReference[];
    relatedTasks: SimilarTask[];
  }
): Promise<AIEnhancementResult | null> {
  const systemPrompt = `You are an AI assistant that helps parse and understand task descriptions for a software development project.

Given a natural language task description, analyze it and provide:
1. A clear, concise title (max 80 characters)
2. An enhanced description that clarifies the intent
3. Any additional components/files that should be affected
4. Scope refinement based on the context

Context:
- Detected task type: ${context.taskType}
- Detected priority: ${context.priority}
- Already identified components: ${context.components.map((c) => c.name).join(", ") || "none"}
- Inferred scope areas: ${context.inferredScope.areas.join(", ") || "none"}
- Related past tasks: ${context.relatedTasks.map((t) => t.title).slice(0, 3).join(", ") || "none"}
${context.historyReferences.length > 0 ? `- History references: ${context.historyReferences.map((r) => `${r.type}: ${r.reference}`).join(", ")}` : ""}

Respond with a JSON object:
{
  "title": "Clear task title",
  "enhancedDescription": "Enhanced description with clearer intent",
  "additionalComponents": [
    {"name": "component", "type": "file|component|service|api", "confidence": 0.7, "suggestedPaths": []}
  ],
  "scopeRefinement": {
    "areas": ["area1", "area2"],
    "suggestedFiles": ["path/to/file.ts"]
  }
}

Only return the JSON object, no other text.`;

  try {
    const { result } = await simpleQuery(systemPrompt, `Task description: ${input}`, {
      model: "claude-sonnet-4-20250514",
    });

    // Parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AIEnhancementResult;
    }
  } catch (err) {
    console.error("AI enhancement failed:", err);
  }

  return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateTitle(input: string, keywords: ExtractedKeyword[], taskType: TaskType): string {
  // Start with the first action keyword and what follows
  const actionKeyword = keywords.find((k) => k.category === "action");
  const contextKeywords = keywords.filter((k) => k.category === "context").slice(0, 2);

  // Try to extract a meaningful title
  let title = input.split(/[.!?\n]/)[0].trim();
  if (title.length > 80) {
    title = title.substring(0, 77) + "...";
  }

  // If too short, build from keywords
  if (title.length < 10 && actionKeyword && contextKeywords.length > 0) {
    const action = actionKeyword.keyword.charAt(0).toUpperCase() + actionKeyword.keyword.slice(1);
    const context = contextKeywords.map((k) => k.keyword).join(" ");
    title = `${action} ${context}`;
  }

  return title || `${taskType.charAt(0).toUpperCase() + taskType.slice(1)} task`;
}

function calculateConfidence(
  typeConfidence: number,
  priorityConfidence: number,
  aiEnhanced: boolean,
  componentCount: number,
  relatedTaskCount: number
): number {
  let confidence = (typeConfidence + priorityConfidence) / 2;

  // Boost from AI enhancement
  if (aiEnhanced) confidence += 0.1;

  // Boost from identified components
  if (componentCount > 0) confidence += Math.min(componentCount * 0.05, 0.15);

  // Boost from related tasks
  if (relatedTaskCount > 0) confidence += Math.min(relatedTaskCount * 0.03, 0.1);

  return Math.min(confidence, 1);
}

function extractFilePatterns(
  components: ComponentReference[],
  entities: ExtractedEntity[],
  scope: ScopeInference
): string[] {
  const patterns: string[] = [];

  // From components
  for (const comp of components) {
    if (comp.type === "file" && comp.name) {
      patterns.push(comp.name);
    }
    patterns.push(...comp.suggestedPaths);
  }

  // From entities
  for (const entity of entities) {
    if (entity.type === "file") {
      patterns.push(entity.text);
    }
  }

  // From scope
  patterns.push(...scope.suggestedFiles);

  return [...new Set(patterns)];
}

// ============================================================================
// Quick Parse (without AI)
// ============================================================================

/**
 * Quick parse without AI enhancement (for faster feedback)
 */
export function quickParseIntent(input: string): {
  taskType: TaskType;
  priority: TaskPriority;
  confidence: number;
} {
  const keywords = extractKeywords(input);
  const { taskType, typeConfidence } = inferTaskType(input, keywords);
  const { priority, priorityConfidence } = inferPriority(input, keywords);

  return {
    taskType,
    priority,
    confidence: (typeConfidence + priorityConfidence) / 2,
  };
}

/**
 * Resolve history references to actual task IDs
 */
export async function resolveHistoryReferences(
  userId: string,
  repositoryId: string,
  references: HistoryReference[]
): Promise<HistoryReference[]> {
  const resolved: HistoryReference[] = [];

  for (const ref of references) {
    if (ref.type === "task" && ref.reference) {
      // Search for matching tasks by title
      const matchingTasks = await prisma.task.findMany({
        where: {
          userId,
          repositoryId,
          OR: [
            { title: { contains: ref.reference, mode: "insensitive" } },
            { description: { contains: ref.reference, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      });

      if (matchingTasks.length > 0) {
        resolved.push({
          ...ref,
          resolvedId: matchingTasks[0].id,
        });
      } else {
        resolved.push(ref);
      }
    } else if (ref.type === "pr" || ref.type === "issue") {
      // PR and issue references remain as-is (resolved externally via GitHub API)
      resolved.push(ref);
    } else {
      resolved.push(ref);
    }
  }

  return resolved;
}
