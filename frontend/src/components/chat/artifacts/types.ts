// Artifact types for the AI Chat system

export type ArtifactType =
  | 'code'
  | 'html'
  | 'markdown'
  | 'mermaid'
  | 'svg'
  | 'json'
  | 'text';

export interface Artifact {
  id: string;
  conversationId: string;
  messageId: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactPreviewProps {
  artifact: Artifact;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export interface ArtifactActionsProps {
  artifact: Artifact;
  onEdit?: () => void;
  onDownload?: (format: string) => void;
  onCopy?: () => void;
  onAttachToTask?: () => void;
  onFullscreen?: () => void;
}

// Detection utilities
export function detectArtifactType(content: string, language?: string): ArtifactType {
  // Check if it's SVG
  if (content.trim().startsWith('<svg') || content.trim().startsWith('<?xml')) {
    if (content.includes('<svg')) {
      return 'svg';
    }
  }

  // Check if it's HTML
  if (content.trim().startsWith('<!DOCTYPE html') ||
      content.trim().startsWith('<html') ||
      (content.includes('<head') && content.includes('<body'))) {
    return 'html';
  }

  // Check if it's Mermaid
  if (content.trim().startsWith('graph ') ||
      content.trim().startsWith('flowchart ') ||
      content.trim().startsWith('sequenceDiagram') ||
      content.trim().startsWith('classDiagram') ||
      content.trim().startsWith('stateDiagram') ||
      content.trim().startsWith('erDiagram') ||
      content.trim().startsWith('gantt') ||
      content.trim().startsWith('pie') ||
      content.trim().startsWith('journey') ||
      content.trim().startsWith('gitGraph')) {
    return 'mermaid';
  }

  // Check if it's JSON
  try {
    JSON.parse(content);
    return 'json';
  } catch {
    // Not JSON
  }

  // Check language-based detection
  if (language) {
    const codeLangs = ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'sql', 'shell', 'bash', 'yaml', 'toml'];
    if (codeLangs.includes(language.toLowerCase())) {
      return 'code';
    }
    if (language.toLowerCase() === 'markdown' || language.toLowerCase() === 'md') {
      return 'markdown';
    }
    if (language.toLowerCase() === 'html') {
      return 'html';
    }
    if (language.toLowerCase() === 'mermaid') {
      return 'mermaid';
    }
    if (language.toLowerCase() === 'svg') {
      return 'svg';
    }
    if (language.toLowerCase() === 'json') {
      return 'json';
    }
  }

  // Default to text
  return 'text';
}

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    go: 'go',
    rs: 'rust',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    json: 'json',
    md: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    xml: 'xml',
    svg: 'svg',
  };
  return langMap[ext] || ext;
}

export function getFileExtensionForType(type: ArtifactType, language?: string): string {
  switch (type) {
    case 'html':
      return 'html';
    case 'svg':
      return 'svg';
    case 'mermaid':
      return 'mmd';
    case 'markdown':
      return 'md';
    case 'json':
      return 'json';
    case 'code':
      if (language) {
        const extMap: Record<string, string> = {
          javascript: 'js',
          typescript: 'ts',
          python: 'py',
          ruby: 'rb',
          java: 'java',
          go: 'go',
          rust: 'rs',
          c: 'c',
          cpp: 'cpp',
          csharp: 'cs',
          php: 'php',
          swift: 'swift',
          kotlin: 'kt',
          scala: 'scala',
          sql: 'sql',
          bash: 'sh',
          shell: 'sh',
          yaml: 'yaml',
          toml: 'toml',
        };
        return extMap[language.toLowerCase()] || language.toLowerCase();
      }
      return 'txt';
    default:
      return 'txt';
  }
}
