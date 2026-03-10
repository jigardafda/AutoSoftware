import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string; // relative to repo root
  type: "file" | "directory";
  size?: number; // bytes, files only
}

export interface FileContentResult {
  content: string | null;
  size: number;
  binary: boolean;
  truncated: boolean;
  language?: string; // inferred from extension
}

// ── Errors ─────────────────────────────────────────────────────────────

export class RepoFsError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "RepoFsError";
    this.code = code;
  }
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const BINARY_CHECK_SIZE = 8 * 1024; // 8 KB

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  css: "css",
  html: "html",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  md: "markdown",
  dockerfile: "docker",
  toml: "toml",
  xml: "xml",
  c: "c",
  cpp: "cpp",
  h: "c",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
};

// ── Helpers ────────────────────────────────────────────────────────────

function repoDir(repoId: string): string {
  return path.join(config.workDir, "repos", repoId);
}

export function safePath(repoId: string, relativePath: string): string {
  const root = repoDir(repoId);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new RepoFsError("Path traversal detected", "PATH_TRAVERSAL");
  }
  return resolved;
}

function inferLanguage(filename: string): string | undefined {
  const lower = filename.toLowerCase();

  // Handle Dockerfile (no extension)
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) {
    return "docker";
  }

  const ext = lower.split(".").pop();
  if (ext) {
    return LANGUAGE_MAP[ext];
  }
  return undefined;
}

function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, BINARY_CHECK_SIZE);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0x00) {
      return true;
    }
  }
  return false;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function getCurrentBranch(repoId: string): Promise<string | null> {
  try {
    const headPath = path.join(repoDir(repoId), ".git", "HEAD");
    const content = (await fs.readFile(headPath, "utf-8")).trim();
    // "ref: refs/heads/main" → "main"
    if (content.startsWith("ref: refs/heads/")) {
      return content.slice("ref: refs/heads/".length);
    }
    // Detached HEAD — return short SHA
    return content.slice(0, 7);
  } catch {
    return null;
  }
}

export async function listDirectory(
  repoId: string,
  relativePath: string,
): Promise<FileEntry[]> {
  const dirPath = safePath(repoId, relativePath);

  const entries = await fs.readdir(dirPath, { withFileTypes: false });
  const results: FileEntry[] = [];

  for (const entryName of entries) {
    // Filter out .git directory
    if (entryName === ".git") continue;

    const entryPath = path.join(dirPath, entryName);
    const stat = await fs.lstat(entryPath);

    // Skip symlinks
    if (stat.isSymbolicLink()) continue;

    const relPath = path.relative(repoDir(repoId), entryPath);

    if (stat.isDirectory()) {
      results.push({
        name: entryName,
        path: relPath,
        type: "directory",
      });
    } else if (stat.isFile()) {
      results.push({
        name: entryName,
        path: relPath,
        type: "file",
        size: stat.size,
      });
    }
  }

  // Sort: directories first, then alphabetical
  results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return results;
}

export async function readFile(
  repoId: string,
  relativePath: string,
): Promise<FileContentResult> {
  const filePath = safePath(repoId, relativePath);

  const stat = await fs.lstat(filePath);

  if (stat.isDirectory()) {
    const err: NodeJS.ErrnoException = new Error("Is a directory");
    err.code = "EISDIR";
    throw err;
  }

  if (stat.isSymbolicLink()) {
    throw new RepoFsError("Symlinks are not supported", "SYMLINK");
  }

  const size = stat.size;
  const language = inferLanguage(path.basename(filePath));

  // Size limit: files > 1MB return metadata only
  if (size > MAX_FILE_SIZE) {
    return {
      content: null,
      size,
      binary: false,
      truncated: true,
      language,
    };
  }

  const buffer = await fs.readFile(filePath);

  if (isBinary(buffer)) {
    return {
      content: null,
      size,
      binary: true,
      truncated: false,
      language,
    };
  }

  return {
    content: buffer.toString("utf-8"),
    size,
    binary: false,
    truncated: false,
    language,
  };
}
