import { Link } from "react-router-dom";

// Matches file paths like "src/foo/bar.ts", "OrbEclipse Shared/Scenes/GameScene.swift"
// A path must contain at least one "/" and end with a known extension.
const FILE_EXTENSIONS = "tsx?|jsx?|py|rs|go|java|json|ya?ml|css|html?|sql|sh|bash|md|toml|xml|c|cpp|h|hpp|rb|php|swift|kt|m|mm|gradle|plist|xcconfig|pbxproj|strings|storyboard|xib|entitlements|resolved|lock|txt|csv|cfg|ini|conf|env|gitignore|dockerignore|Dockerfile|Makefile";
const FILE_PATH_RE = new RegExp(
  `(?<![\\w/])([\\w][\\w .\\-]*(?:/[\\w][\\w .\\-]*)+\\.(?:${FILE_EXTENSIONS}))(?:\\b|(?=\\s|$|[,;:)\\]]))`,
  "g"
);

// Also match "line(s) N" or "around line N" references after a path
const LINE_REF_RE = /^(\s+(?:around\s+)?lines?\s+(\d+)[\d–\-,\s]*)/;

interface LinkedTextProps {
  text: string;
  repoId: string;
}

export function LinkedText({ text, repoId }: LinkedTextProps) {
  const parts: (string | { path: string; display: string; line?: number })[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(FILE_PATH_RE)) {
    const filePath = match[1];
    const start = match.index!;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    // Check for line reference after the path
    const afterPath = text.slice(start + match[0].length);
    const lineMatch = afterPath.match(LINE_REF_RE);
    const display = filePath + (lineMatch ? lineMatch[0] : "");
    const line = lineMatch ? parseInt(lineMatch[2], 10) : undefined;

    parts.push({ path: filePath, display, line });
    lastIndex = start + match[0].length + (lineMatch ? lineMatch[0].length : 0);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === "string")) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <Link
            key={i}
            to={`/repos/${repoId}?tab=files&path=${encodeURIComponent(part.path)}${part.line ? `&line=${part.line}` : ""}`}
            className="text-primary hover:underline font-mono text-[0.85em]"
          >
            {part.display}
          </Link>
        )
      )}
    </>
  );
}
