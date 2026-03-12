/**
 * Smart Clarification Service
 *
 * AI-powered clarification system that generates contextual questions
 * based on codebase analysis when creating tasks from AI conversations.
 *
 * Features:
 * - Analyzes task descriptions for ambiguous terms
 * - Detects project context (frameworks, patterns, file structure)
 * - Generates relevant "Did you mean X or Y?" disambiguations
 * - Tracks user preferences per project for future reference
 */

import { prisma } from "../db.js";
import {
  resolveAuth,
  setupAgentSdkAuth,
  isValidAuth,
  simpleQuery,
} from "./claude-query.js";

// ============================================================================
// Types
// ============================================================================

export interface ClarificationQuestion {
  id: string;
  type: "disambiguation" | "confirmation" | "choice" | "input";
  question: string;
  context: string;
  options?: ClarificationOption[];
  defaultValue?: string;
  required: boolean;
  category: "framework" | "pattern" | "scope" | "behavior" | "naming" | "general";
}

export interface ClarificationOption {
  value: string;
  label: string;
  description?: string;
  confidence?: number;
}

export interface ProjectContext {
  projectId: string;
  repositoryId: string;
  detectedFrameworks: string[];
  detectedPatterns: string[];
  primaryLanguage: string;
  fileStructure: FileStructureInfo;
  existingConventions: ConventionInfo;
}

export interface FileStructureInfo {
  hasTests: boolean;
  testFramework?: string;
  hasSrcDir: boolean;
  hasComponentsDir: boolean;
  hasServicesDir: boolean;
  hasUtilsDir: boolean;
  buildTool?: string;
}

export interface ConventionInfo {
  namingStyle?: "camelCase" | "snake_case" | "kebab-case" | "PascalCase";
  indentStyle?: "tabs" | "spaces";
  quotesStyle?: "single" | "double";
}

export interface ClarificationResult {
  questions: ClarificationQuestion[];
  projectContext: ProjectContext;
  ambiguousTerms: AmbiguousTerm[];
}

export interface AmbiguousTerm {
  term: string;
  possibleMeanings: string[];
  context: string;
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string | string[];
}

export interface ClarificationSession {
  id: string;
  projectId: string;
  repositoryId: string;
  taskDescription: string;
  questions: ClarificationQuestion[];
  answers: ClarificationAnswer[];
  status: "pending" | "completed" | "skipped";
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Constants
// ============================================================================

const AMBIGUOUS_TERMS: Record<string, string[]> = {
  component: ["React component", "Vue component", "Angular component", "Web component", "Generic UI component"],
  api: ["REST API endpoint", "GraphQL API", "Internal API/service", "Third-party API integration"],
  database: ["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Redis"],
  auth: ["JWT authentication", "Session-based auth", "OAuth2/SSO", "API key authentication"],
  test: ["Unit tests", "Integration tests", "E2E tests", "All types of tests"],
  style: ["CSS/SCSS", "Tailwind CSS", "CSS-in-JS (styled-components)", "CSS Modules"],
  state: ["React Context", "Redux/Zustand", "Local component state", "Server state (React Query)"],
  form: ["React Hook Form", "Formik", "Native form handling", "Controlled inputs"],
  modal: ["Dialog component", "Popup/overlay", "Drawer/side panel", "Toast notification"],
  button: ["Primary action button", "Secondary/outline button", "Icon button", "Link styled as button"],
  table: ["Data grid component", "Simple HTML table", "Virtualized table", "Sortable/filterable table"],
  page: ["Route/page component", "Landing page", "Dashboard page", "Form page"],
  service: ["Backend service class", "API client service", "Utility/helper service", "Domain service"],
};

const FRAMEWORK_INDICATORS: Record<string, string[]> = {
  react: ["react", "jsx", "tsx", "use", "useState", "useEffect", "component"],
  vue: ["vue", "vuex", "pinia", "v-if", "v-for", "composition api"],
  angular: ["angular", "ng-", "@angular", "rxjs", "injectable"],
  nextjs: ["next", "nextjs", "getServerSideProps", "getStaticProps", "app router"],
  express: ["express", "middleware", "router", "app.get", "app.post"],
  fastify: ["fastify", "plugin", "preHandler", "schema"],
  nest: ["nestjs", "@Injectable", "@Controller", "@Module"],
  prisma: ["prisma", "schema.prisma", "prisma client"],
};

// ============================================================================
// Clarification Service
// ============================================================================

/**
 * Analyze a task description and generate clarifying questions
 */
export async function generateClarifyingQuestions(
  userId: string,
  repositoryId: string,
  taskDescription: string,
  projectId?: string
): Promise<ClarificationResult> {
  // Get project context
  const projectContext = await analyzeProjectContext(userId, repositoryId, projectId);

  // Find ambiguous terms in the description
  const ambiguousTerms = detectAmbiguousTerms(taskDescription, projectContext);

  // Check for learned preferences
  const learnedPreferences = await getLearnedPreferences(userId, projectId || repositoryId);

  // Generate questions using AI
  const questions = await generateQuestionsWithAI(
    userId,
    taskDescription,
    projectContext,
    ambiguousTerms,
    learnedPreferences
  );

  return {
    questions,
    projectContext,
    ambiguousTerms,
  };
}

/**
 * Analyze repository to detect frameworks, patterns, and conventions
 */
async function analyzeProjectContext(
  userId: string,
  repositoryId: string,
  projectId?: string
): Promise<ProjectContext> {
  // Get repository info
  const repository = await prisma.repository.findFirst({
    where: { id: repositoryId, userId },
    include: {
      scanResults: {
        orderBy: { scannedAt: "desc" },
        take: 1,
        include: { codeAnalysis: true },
      },
      conventions: { take: 1 },
    },
  });

  if (!repository) {
    throw new Error("Repository not found");
  }

  const latestScan = repository.scanResults[0];
  const convention = repository.conventions[0];

  // Extract detected frameworks from scan data
  const detectedFrameworks: string[] = [];
  const detectedPatterns: string[] = [];

  if (latestScan) {
    const analysisData = latestScan.analysisData as any;
    if (analysisData?.frameworks) {
      detectedFrameworks.push(...analysisData.frameworks);
    }
    if (analysisData?.patterns) {
      detectedPatterns.push(...analysisData.patterns);
    }

    // Check code analysis for architecture patterns
    if (latestScan.codeAnalysis?.architecturePattern) {
      detectedPatterns.push(latestScan.codeAnalysis.architecturePattern);
    }
  }

  // Detect file structure from convention or scan
  const fileStructure: FileStructureInfo = {
    hasTests: false,
    hasSrcDir: false,
    hasComponentsDir: false,
    hasServicesDir: false,
    hasUtilsDir: false,
  };

  if (convention) {
    const frameworkPatterns = convention.frameworkPatterns as any[];
    if (frameworkPatterns?.length) {
      for (const pattern of frameworkPatterns) {
        if (pattern.type === "test_framework") {
          fileStructure.hasTests = true;
          fileStructure.testFramework = pattern.name;
        }
        if (pattern.type === "build_tool") {
          fileStructure.buildTool = pattern.name;
        }
        // Detect directory structure patterns
        if (pattern.path?.includes("/src/")) fileStructure.hasSrcDir = true;
        if (pattern.path?.includes("/components/")) fileStructure.hasComponentsDir = true;
        if (pattern.path?.includes("/services/")) fileStructure.hasServicesDir = true;
        if (pattern.path?.includes("/utils/") || pattern.path?.includes("/lib/")) fileStructure.hasUtilsDir = true;
      }
    }
  }

  // Build convention info
  const existingConventions: ConventionInfo = {};
  if (convention) {
    if (convention.namingConvention) {
      existingConventions.namingStyle = convention.namingConvention as any;
    }
    if (convention.indentStyle) {
      existingConventions.indentStyle = convention.indentStyle as any;
    }
    if (convention.quoteStyle) {
      existingConventions.quotesStyle = convention.quoteStyle as any;
    }
  }

  return {
    projectId: projectId || repositoryId,
    repositoryId,
    detectedFrameworks,
    detectedPatterns,
    primaryLanguage: latestScan?.primaryLanguage || "unknown",
    fileStructure,
    existingConventions,
  };
}

/**
 * Detect ambiguous terms in the task description
 */
function detectAmbiguousTerms(
  taskDescription: string,
  projectContext: ProjectContext
): AmbiguousTerm[] {
  const ambiguousTerms: AmbiguousTerm[] = [];
  const lowerDescription = taskDescription.toLowerCase();

  for (const [term, meanings] of Object.entries(AMBIGUOUS_TERMS)) {
    if (lowerDescription.includes(term)) {
      // Filter meanings based on project context
      const relevantMeanings = filterMeaningsByContext(meanings, projectContext);

      if (relevantMeanings.length > 1) {
        // Find the context around the term
        const termIndex = lowerDescription.indexOf(term);
        const start = Math.max(0, termIndex - 30);
        const end = Math.min(lowerDescription.length, termIndex + term.length + 30);
        const context = taskDescription.slice(start, end);

        ambiguousTerms.push({
          term,
          possibleMeanings: relevantMeanings,
          context: context.trim(),
        });
      }
    }
  }

  return ambiguousTerms;
}

/**
 * Filter meanings based on detected project context
 */
function filterMeaningsByContext(
  meanings: string[],
  projectContext: ProjectContext
): string[] {
  const { detectedFrameworks, primaryLanguage } = projectContext;

  return meanings.filter((meaning) => {
    const lowerMeaning = meaning.toLowerCase();

    // If React is detected, filter out Vue/Angular component options
    if (detectedFrameworks.includes("react")) {
      if (lowerMeaning.includes("vue") || lowerMeaning.includes("angular")) {
        return false;
      }
    }

    // If Vue is detected, filter out React/Angular options
    if (detectedFrameworks.includes("vue")) {
      if (lowerMeaning.includes("react") || lowerMeaning.includes("angular")) {
        return false;
      }
    }

    // Language-specific filtering
    if (primaryLanguage === "python" && lowerMeaning.includes("typescript")) {
      return false;
    }

    return true;
  });
}

/**
 * Generate questions using AI based on context and ambiguities
 */
async function generateQuestionsWithAI(
  userId: string,
  taskDescription: string,
  projectContext: ProjectContext,
  ambiguousTerms: AmbiguousTerm[],
  learnedPreferences: Map<string, string>
): Promise<ClarificationQuestion[]> {
  const questions: ClarificationQuestion[] = [];

  // Generate disambiguation questions for ambiguous terms
  for (const term of ambiguousTerms) {
    // Skip if we already know the user's preference
    const preferenceKey = `${term.term}_meaning`;
    if (learnedPreferences.has(preferenceKey)) {
      continue;
    }

    const questionId = `disambiguate_${term.term}_${Date.now()}`;
    questions.push({
      id: questionId,
      type: "disambiguation",
      question: `When you mention "${term.term}", did you mean:`,
      context: term.context,
      options: term.possibleMeanings.map((meaning, index) => ({
        value: meaning,
        label: meaning,
        confidence: index === 0 ? 0.7 : 0.3 / (term.possibleMeanings.length - 1),
      })),
      required: true,
      category: "general",
    });
  }

  // Use AI to generate additional contextual questions
  const auth = await resolveAuth(userId);
  if (isValidAuth(auth)) {
    setupAgentSdkAuth(auth);

    try {
      const aiQuestions = await generateAIQuestions(
        taskDescription,
        projectContext,
        learnedPreferences
      );
      questions.push(...aiQuestions);
    } catch (err) {
      console.error("Failed to generate AI questions:", err);
      // Continue with rule-based questions only
    }
  }

  // Add framework-specific questions if not already answered
  const frameworkQuestions = generateFrameworkQuestions(projectContext, learnedPreferences);
  questions.push(...frameworkQuestions);

  // Limit to 3 most important questions
  return prioritizeQuestions(questions).slice(0, 3);
}

/**
 * Use AI to generate contextual questions
 */
async function generateAIQuestions(
  taskDescription: string,
  projectContext: ProjectContext,
  learnedPreferences: Map<string, string>
): Promise<ClarificationQuestion[]> {
  const systemPrompt = `You are an AI assistant that helps clarify task requirements. Given a task description and project context, generate 1-2 clarifying questions that would help understand the user's intent better.

Focus on:
1. Scope clarification (e.g., "Should this apply to all pages or just the dashboard?")
2. Behavior details (e.g., "Should the form validate on blur or on submit?")
3. Integration questions (e.g., "Should this connect to the existing auth system?")

Project context:
- Frameworks: ${projectContext.detectedFrameworks.join(", ") || "Not detected"}
- Patterns: ${projectContext.detectedPatterns.join(", ") || "Not detected"}
- Primary language: ${projectContext.primaryLanguage}
- Has tests: ${projectContext.fileStructure.hasTests}
- Test framework: ${projectContext.fileStructure.testFramework || "None detected"}

Known preferences: ${JSON.stringify(Object.fromEntries(learnedPreferences))}

Return a JSON array of questions in this format:
[{
  "id": "unique_id",
  "type": "choice" | "confirmation" | "input",
  "question": "The question text",
  "context": "Why this question is relevant",
  "options": [{"value": "...", "label": "..."}],
  "category": "scope" | "behavior" | "pattern"
}]

Only return the JSON array, no other text. If no questions are needed, return an empty array.`;

  const model = "claude-sonnet-4-20250514";

  try {
    const { result } = await simpleQuery(systemPrompt, `Task: ${taskDescription}`, { model });

    // Parse AI response
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return parsed.map((q: any) => ({
        id: q.id || `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: q.type || "choice",
        question: q.question,
        context: q.context || "",
        options: q.options,
        required: q.required ?? false,
        category: q.category || "general",
      }));
    }
  } catch (err) {
    console.error("Failed to parse AI questions:", err);
  }

  return [];
}

/**
 * Generate framework-specific questions
 */
function generateFrameworkQuestions(
  projectContext: ProjectContext,
  learnedPreferences: Map<string, string>
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  const { detectedFrameworks, fileStructure } = projectContext;

  // Test question if tests exist but preference unknown
  if (fileStructure.hasTests && !learnedPreferences.has("include_tests")) {
    questions.push({
      id: `framework_tests_${Date.now()}`,
      type: "confirmation",
      question: "Should this change include test updates?",
      context: `Test framework detected: ${fileStructure.testFramework || "unknown"}`,
      options: [
        { value: "yes", label: "Yes, include tests" },
        { value: "no", label: "No, skip tests" },
        { value: "later", label: "Add tests in a follow-up task" },
      ],
      required: false,
      category: "pattern",
    });
  }

  // React-specific questions
  if (detectedFrameworks.includes("react") && !learnedPreferences.has("component_style")) {
    questions.push({
      id: `react_component_style_${Date.now()}`,
      type: "choice",
      question: "What component style should be used?",
      context: "React detected in project",
      options: [
        { value: "functional", label: "Functional component with hooks" },
        { value: "class", label: "Class component" },
      ],
      required: false,
      category: "pattern",
    });
  }

  return questions;
}

/**
 * Prioritize questions by importance
 */
function prioritizeQuestions(questions: ClarificationQuestion[]): ClarificationQuestion[] {
  const priority: Record<string, number> = {
    disambiguation: 3,
    scope: 2,
    behavior: 2,
    pattern: 1,
    naming: 1,
    general: 0,
  };

  return questions.sort((a, b) => {
    const priorityA = a.type === "disambiguation" ? priority.disambiguation : (priority[a.category] || 0);
    const priorityB = b.type === "disambiguation" ? priority.disambiguation : (priority[b.category] || 0);
    return priorityB - priorityA;
  });
}

/**
 * Get learned preferences for a user/project
 */
async function getLearnedPreferences(
  userId: string,
  contextId: string
): Promise<Map<string, string>> {
  const preferences = new Map<string, string>();

  const history = await prisma.clarificationHistory.findMany({
    where: {
      userId,
      OR: [{ projectId: contextId }, { repositoryId: contextId }],
    },
    orderBy: { usageCount: "desc" },
    take: 50,
  });

  for (const entry of history) {
    preferences.set(entry.preferenceKey, entry.preferenceValue);
  }

  return preferences;
}

/**
 * Save clarification answers and update preferences
 */
export async function saveClarificationAnswers(
  userId: string,
  repositoryId: string,
  answers: ClarificationAnswer[],
  projectId?: string
): Promise<void> {
  const contextId = projectId || repositoryId;

  for (const answer of answers) {
    // Extract preference key from question ID
    const preferenceKey = answer.questionId.replace(/_([\d]+)$/, "");
    const preferenceValue = Array.isArray(answer.answer)
      ? answer.answer.join(",")
      : answer.answer;

    // Upsert preference
    await prisma.clarificationHistory.upsert({
      where: {
        userId_projectId_preferenceKey: {
          userId,
          projectId: contextId,
          preferenceKey,
        },
      },
      create: {
        userId,
        projectId: contextId,
        repositoryId,
        preferenceKey,
        preferenceValue,
        usageCount: 1,
      },
      update: {
        preferenceValue,
        usageCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Get clarification session by ID
 */
export async function getClarificationSession(
  sessionId: string,
  userId: string
): Promise<ClarificationSession | null> {
  const session = await prisma.clarificationSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) return null;

  return {
    id: session.id,
    projectId: session.projectId,
    repositoryId: session.repositoryId,
    taskDescription: session.taskDescription,
    questions: session.questions as unknown as ClarificationQuestion[],
    answers: session.answers as unknown as ClarificationAnswer[],
    status: session.status as "pending" | "completed" | "skipped",
    createdAt: session.createdAt,
    completedAt: session.completedAt || undefined,
  };
}

/**
 * Create a new clarification session
 */
export async function createClarificationSession(
  userId: string,
  repositoryId: string,
  taskDescription: string,
  questions: ClarificationQuestion[],
  projectId?: string
): Promise<string> {
  const session = await prisma.clarificationSession.create({
    data: {
      userId,
      repositoryId,
      projectId: projectId || repositoryId,
      taskDescription,
      questions: questions as any,
      answers: [],
      status: "pending",
    },
  });

  return session.id;
}

/**
 * Complete a clarification session with answers
 */
export async function completeClarificationSession(
  sessionId: string,
  userId: string,
  answers: ClarificationAnswer[]
): Promise<void> {
  const session = await prisma.clarificationSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  // Update session
  await prisma.clarificationSession.update({
    where: { id: sessionId },
    data: {
      answers: answers as any,
      status: "completed",
      completedAt: new Date(),
    },
  });

  // Save answers as learned preferences
  await saveClarificationAnswers(
    userId,
    session.repositoryId,
    answers,
    session.projectId
  );
}

/**
 * Skip clarification for a session
 */
export async function skipClarification(
  sessionId: string,
  userId: string
): Promise<void> {
  await prisma.clarificationSession.updateMany({
    where: { id: sessionId, userId },
    data: { status: "skipped", completedAt: new Date() },
  });
}

/**
 * Get recent clarification history for a project
 */
export async function getClarificationHistory(
  userId: string,
  projectId: string,
  limit: number = 20
): Promise<Array<{ key: string; value: string; count: number }>> {
  const history = await prisma.clarificationHistory.findMany({
    where: { userId, projectId },
    orderBy: { usageCount: "desc" },
    take: limit,
  });

  return history.map((h) => ({
    key: h.preferenceKey,
    value: h.preferenceValue,
    count: h.usageCount,
  }));
}

/**
 * Clear learned preferences for a project
 */
export async function clearPreferences(
  userId: string,
  projectId: string
): Promise<number> {
  const result = await prisma.clarificationHistory.deleteMany({
    where: { userId, projectId },
  });

  return result.count;
}

/**
 * Export preferences for a project (for backup/sharing)
 */
export async function exportPreferences(
  userId: string,
  projectId: string
): Promise<Record<string, string>> {
  const history = await prisma.clarificationHistory.findMany({
    where: { userId, projectId },
  });

  const preferences: Record<string, string> = {};
  for (const h of history) {
    preferences[h.preferenceKey] = h.preferenceValue;
  }

  return preferences;
}

/**
 * Import preferences for a project
 */
export async function importPreferences(
  userId: string,
  projectId: string,
  repositoryId: string,
  preferences: Record<string, string>
): Promise<number> {
  let imported = 0;

  for (const [key, value] of Object.entries(preferences)) {
    await prisma.clarificationHistory.upsert({
      where: {
        userId_projectId_preferenceKey: {
          userId,
          projectId,
          preferenceKey: key,
        },
      },
      create: {
        userId,
        projectId,
        repositoryId,
        preferenceKey: key,
        preferenceValue: value,
        usageCount: 1,
      },
      update: {
        preferenceValue: value,
      },
    });
    imported++;
  }

  return imported;
}
