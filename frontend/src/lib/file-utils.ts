const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "rs", "go", "java",
  "c", "cpp", "rb", "php", "swift", "kt",
]);

const TEXT_EXTENSIONS = new Set([
  "md", "txt", "json", "yaml", "yml", "toml", "xml", "csv", "html", "css",
]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp",
]);

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

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
  htm: "html",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  md: "markdown",
  markdown: "markdown",
  dockerfile: "docker",
  toml: "toml",
  xml: "xml",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
};

function getExtension(name: string): string {
  const lower = name.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return lower; // no extension, use full name (e.g. "Dockerfile")
  return lower.slice(dotIndex + 1);
}

export function getFileIcon(
  name: string,
  type: "file" | "directory"
): "folder" | "folder-open" | "file-code" | "file-text" | "file" {
  if (type === "directory") return "folder";
  const ext = getExtension(name);
  if (CODE_EXTENSIONS.has(ext)) return "file-code";
  if (TEXT_EXTENSIONS.has(ext)) return "file-text";
  return "file";
}

export function getLanguageFromFilename(name: string): string | undefined {
  const ext = getExtension(name);
  return LANGUAGE_MAP[ext];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function isImageFile(name: string): boolean {
  const ext = getExtension(name);
  return IMAGE_EXTENSIONS.has(ext);
}

export function isMarkdownFile(name: string): boolean {
  const ext = getExtension(name);
  return MARKDOWN_EXTENSIONS.has(ext);
}

const PDF_EXTENSIONS = new Set(["pdf"]);

export function isPdfFile(name: string): boolean {
  const ext = getExtension(name);
  return PDF_EXTENSIONS.has(ext);
}
