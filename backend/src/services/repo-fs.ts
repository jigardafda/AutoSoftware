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

function repoDir(repoId: string, rootOverride?: string): string {
  return rootOverride || path.join(config.workDir, "repos", repoId);
}

export function safePath(repoId: string, relativePath: string, rootOverride?: string): string {
  const root = repoDir(repoId, rootOverride);
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

export async function getCurrentBranch(repoId: string, rootOverride?: string): Promise<string | null> {
  try {
    const headPath = path.join(repoDir(repoId, rootOverride), ".git", "HEAD");
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

export async function checkoutBranch(repoId: string, branch: string, rootOverride?: string): Promise<void> {
  const dir = repoDir(repoId, rootOverride);
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  // Validate branch name to prevent injection (alphanumeric, dash, underscore, slash, dot)
  if (!/^[\w\-./]+$/.test(branch)) {
    throw new RepoFsError("Invalid branch name", "INVALID_BRANCH");
  }

  // Check if already on the requested branch
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir });
    if (stdout.trim() === branch) return; // already on the right branch
  } catch {
    // Ignore — proceed with checkout
  }

  // Only fetch from remote for cloned repos (not local repos)
  if (!rootOverride) {
    try {
      await execFileAsync("git", ["fetch", "origin", branch], { cwd: dir, timeout: 10_000 });
    } catch {
      // Ignore fetch errors - branch might already be local
    }
  }

  // Checkout the branch
  await execFileAsync("git", ["checkout", branch], { cwd: dir });
}

export async function listDirectory(
  repoId: string,
  relativePath: string,
  rootOverride?: string,
): Promise<FileEntry[]> {
  const dirPath = safePath(repoId, relativePath, rootOverride);
  const root = repoDir(repoId, rootOverride);

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  // Collect file stat promises in parallel for sizes
  const fileStatPromises: Promise<void>[] = [];

  for (const entry of entries) {
    // Filter out .git directory
    if (entry.name === ".git") continue;
    // Skip symlinks
    if (entry.isSymbolicLink()) continue;

    const entryPath = path.join(dirPath, entry.name);
    const relPath = path.relative(root, entryPath);

    if (entry.isDirectory()) {
      results.push({
        name: entry.name,
        path: relPath,
        type: "directory",
      });
    } else if (entry.isFile()) {
      const fileEntry: FileEntry = {
        name: entry.name,
        path: relPath,
        type: "file",
      };
      results.push(fileEntry);
      // Get file size in parallel
      fileStatPromises.push(
        fs.stat(entryPath).then((stat) => { fileEntry.size = stat.size; })
      );
    }
  }

  await Promise.all(fileStatPromises);

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
  rootOverride?: string,
): Promise<FileContentResult> {
  const filePath = safePath(repoId, relativePath, rootOverride);

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
