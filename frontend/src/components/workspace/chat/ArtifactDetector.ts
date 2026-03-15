/**
 * Artifact detection for workspace chat messages.
 * Scans markdown content for fenced code blocks and classifies them
 * as previewable artifacts (HTML, React, SVG, CSV, Mermaid, etc.).
 */

export interface Artifact {
  id: string;
  type: "html" | "markdown" | "react" | "code" | "svg" | "csv" | "text" | "mermaid";
  title: string;
  content: string;
  language?: string;
  filename?: string;
}

const LANGUAGE_TYPE_MAP: Record<string, Artifact["type"]> = {
  html: "html",
  markdown: "markdown",
  md: "markdown",
  jsx: "react",
  tsx: "react",
  react: "react",
  svg: "svg",
  csv: "csv",
  mermaid: "mermaid",
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  html: ".html",
  markdown: ".md",
  md: ".md",
  jsx: ".jsx",
  tsx: ".tsx",
  react: ".jsx",
  svg: ".svg",
  csv: ".csv",
  mermaid: ".mmd",
  javascript: ".js",
  js: ".js",
  typescript: ".ts",
  ts: ".ts",
  python: ".py",
  py: ".py",
  go: ".go",
  rust: ".rs",
  java: ".java",
  css: ".css",
  json: ".json",
  yaml: ".yaml",
  yml: ".yml",
  sql: ".sql",
  sh: ".sh",
  bash: ".sh",
  ruby: ".rb",
  php: ".php",
  c: ".c",
  cpp: ".cpp",
  csharp: ".cs",
  swift: ".swift",
  kotlin: ".kt",
};

/** Regex matching fenced code blocks: ```lang\ncontent\n``` */
const FENCED_BLOCK_RE = /```(\w+)?\s*\n([\s\S]*?)```/g;

let idCounter = 0;

function generateId(): string {
  return `artifact-${Date.now()}-${++idCounter}`;
}

function inferTitle(content: string, language: string | undefined): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";

  // For HTML, look for <title> tag
  if (language === "html") {
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) return titleMatch[1];
  }

  // For code, look for common patterns (function/class/export declarations)
  const declMatch = firstLine.match(
    /^(?:export\s+)?(?:default\s+)?(?:function|class|const|let|var|interface|type|def|fn|pub\s+fn)\s+(\w+)/
  );
  if (declMatch) return declMatch[1];

  // For HTML-like content, try the first tag
  if (language === "html" || language === "svg") {
    const tagMatch = firstLine.match(/^<(\w+)/);
    if (tagMatch) return `${tagMatch[1]} element`;
  }

  // For comment-style headers (// Title or # Title or /* Title */)
  const commentMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*(.{1,50})/);
  if (commentMatch) return commentMatch[1].replace(/\*\/\s*$/, "").trim();

  // Fallback to language name
  return language ? `${language} snippet` : "Code snippet";
}

function inferFilename(
  title: string,
  language: string | undefined,
  type: Artifact["type"]
): string {
  const ext = language ? LANGUAGE_EXTENSIONS[language] : undefined;
  const safeName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  if (ext) return `${safeName || "artifact"}${ext}`;

  // Fallback extensions by type
  const typeExt: Record<Artifact["type"], string> = {
    html: ".html",
    markdown: ".md",
    react: ".jsx",
    svg: ".svg",
    csv: ".csv",
    mermaid: ".mmd",
    code: ".txt",
    text: ".txt",
  };
  return `${safeName || "artifact"}${typeExt[type]}`;
}

/** Map file extension (without dot) → language key for artifact detection */
const EXT_TO_LANGUAGE: Record<string, string> = {
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  jsx: "jsx", tsx: "tsx",
  svg: "svg", csv: "csv", mmd: "mermaid",
  js: "javascript", ts: "typescript",
  py: "python", go: "go", rs: "rust", java: "java",
  css: "css", json: "json", yaml: "yaml", yml: "yml",
  sql: "sql", sh: "sh", bash: "bash",
  rb: "ruby", php: "php", c: "c", cpp: "cpp",
  cs: "csharp", swift: "swift", kt: "kotlin",
};

/**
 * Extract an artifact from a tool call (Write/Edit) that created or modified a file.
 * Returns null if the tool call doesn't contain previewable file content.
 */
export function extractToolCallArtifact(
  toolName: string,
  toolInput: string | undefined,
): Artifact | null {
  if (!toolInput) return null;

  const name = toolName.toLowerCase();
  const isWrite = name === "write" || name.includes("write") || name.includes("create");
  const isEdit = name === "edit" || name.includes("edit");
  if (!isWrite && !isEdit) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(toolInput);
  } catch {
    return null;
  }

  const filePath = (parsed.file_path as string) || (parsed.path as string) || (parsed.filename as string) || "";
  const content = (parsed.content as string) || (parsed.new_string as string) || "";

  if (!content || !filePath) return null;

  // Only show artifacts for substantial content (>3 lines)
  const lineCount = content.split("\n").length;
  if (lineCount <= 3) return null;

  // Determine language from file extension
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const language = EXT_TO_LANGUAGE[ext] || ext;

  const type: Artifact["type"] =
    language && language in LANGUAGE_TYPE_MAP
      ? LANGUAGE_TYPE_MAP[language]
      : language
        ? "code"
        : "text";

  const filename = filePath.split("/").pop() || "file";
  const title = filename;

  return {
    id: generateId(),
    type,
    title,
    content,
    language: language || undefined,
    filename,
  };
}

/**
 * Extract previewable artifacts from markdown content.
 * Only includes code blocks with more than 3 lines.
 */
export function extractArtifacts(markdownContent: string): Artifact[] {
  const artifacts: Artifact[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  FENCED_BLOCK_RE.lastIndex = 0;

  while ((match = FENCED_BLOCK_RE.exec(markdownContent)) !== null) {
    const language = match[1]?.toLowerCase();
    const content = match[2].trimEnd();

    // Only include substantial blocks (more than 3 lines)
    const lineCount = content.split("\n").length;
    if (lineCount <= 3) continue;

    const type: Artifact["type"] =
      language && language in LANGUAGE_TYPE_MAP
        ? LANGUAGE_TYPE_MAP[language]
        : language
          ? "code"
          : "text";

    const title = inferTitle(content, language);
    const filename = inferFilename(title, language, type);

    artifacts.push({
      id: generateId(),
      type,
      title,
      content,
      language,
      filename,
    });
  }

  return artifacts;
}
