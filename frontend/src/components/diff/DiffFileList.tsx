import { useState, type SVGProps } from "react";
import { ChevronRight, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffViewer } from "./DiffViewer";

interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

interface DiffFileListProps {
  files: ChangedFile[];
  diff: string;
}

const STATUS_CONFIG = {
  modified: { letter: "M", color: "text-yellow-500", bg: "bg-yellow-500/10" },
  added: { letter: "A", color: "text-green-500", bg: "bg-green-500/10" },
  deleted: { letter: "D", color: "text-red-500", bg: "bg-red-500/10" },
};

// --- SVG language/file icons ---

type SvgIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const PythonIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M7.932 2C4.816 2 5.079 3.339 5.079 3.339L5.082 4.727H7.979V5.143H3.674S2 4.935 2 8.028c0 3.093 1.46 2.984 1.46 2.984H4.6V9.587s-.079-1.46 1.436-1.46H8.4s1.389.022 1.389-1.344V4.326S10.014 2 7.932 2zM6.226 3.237a.454.454 0 110 .908.454.454 0 010-.908z" fill="#3776AB"/>
    <path d="M8.068 14c3.116 0 2.853-1.339 2.853-1.339L10.918 11.273H8.021V10.857h4.305S14 11.065 14 7.972c0-3.093-1.46-2.984-1.46-2.984H11.4v1.425s.079 1.46-1.436 1.46H7.6s-1.389-.022-1.389 1.344v2.457S5.986 14 8.068 14zm1.706-1.237a.454.454 0 110-.908.454.454 0 010 .908z" fill="#FFD43B"/>
  </svg>
);

const JavaScriptIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="1" y="1" width="14" height="14" rx="1.5" fill="#F7DF1E"/>
    <path d="M5.462 11.589c.282.46.649.8 1.297.8.545 0 .893-.272.893-.649 0-.451-.358-.611-1.012-.873l-.347-.149c-1.003-.427-1.67-0.961-1.67-2.092 0-1.041.793-1.834 2.033-1.834.883 0 1.518.307 1.975 1.112l-1.082.694c-.238-.427-.495-.595-.893-.595-.406 0-.664.258-.664.595 0 .417.258.585.853.843l.347.149c1.181.507 1.849 1.024 1.849 2.184 0 1.252-.983 1.938-2.303 1.938-1.291 0-2.125-.615-2.532-1.422l1.256-.701zm5.4.065c.208.368.477.639.954.639.406 0 .664-.203.664-.498 0-.387-.267-.524-.714-.749l-.244-.105c-.709-.302-1.179-.68-1.179-1.48 0-.736.561-1.297 1.438-1.297.625 0 1.074.218 1.397.787l-.765.505c-.168-.302-.35-.42-.632-.42-.287 0-.47.182-.47.42 0 .294.183.413.607.596l.244.105c.835.358 1.305.724 1.305 1.546 0 .886-.696 1.371-1.63 1.371-.913 0-1.504-.435-1.792-1.005l.817-.414z" fill="#323330"/>
  </svg>
);

const TypeScriptIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="1" y="1" width="14" height="14" rx="1.5" fill="#3178C6"/>
    <path d="M5.21 8.563h1.307v4.765h1.12V8.563h1.307V7.572H5.21v.991zm5.382-.991v3.483c0 .35-.026.614-.195.816-.17.202-.431.31-.787.31-.338 0-.594-.115-.768-.344-.174-.23-.261-.56-.261-.99h-1.12c0 .706.216 1.261.648 1.665.432.403.998.605 1.697.605.662 0 1.18-.195 1.555-.585.374-.39.561-.932.561-1.627V7.572H10.592z" fill="white"/>
  </svg>
);

const ReactIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="1.2" fill="#61DAFB"/>
    <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61DAFB" strokeWidth="0.7" fill="none" transform="rotate(0 8 8)"/>
    <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61DAFB" strokeWidth="0.7" fill="none" transform="rotate(60 8 8)"/>
    <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61DAFB" strokeWidth="0.7" fill="none" transform="rotate(120 8 8)"/>
  </svg>
);

const HtmlIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M2.5 1.5L3.5 13l4.5 2 4.5-2 1-11.5H2.5z" fill="#E44D26"/>
    <path d="M8 3v10.5l3.5-1.5.8-9H8z" fill="#F16529"/>
    <path d="M5.2 5.5h5.6l-.15 1.8H6.3l.15 1.8h4.2l-.25 2.8L8 12.5l-2.4-.6-.15-1.9h1.5l.08 1 1 .25 1-.25.1-1.5H5.6L5.2 5.5z" fill="white"/>
  </svg>
);

const CssIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M2.5 1.5L3.5 13l4.5 2 4.5-2 1-11.5H2.5z" fill="#1572B6"/>
    <path d="M8 3v10.5l3.5-1.5.8-9H8z" fill="#33A9DC"/>
    <path d="M5.2 5.5h5.6l-.15 1.8H6.3l.15 1.8h4.2l-.25 2.8L8 12.5l-2.4-.6-.15-1.9h1.5l.08 1 1 .25 1-.25.1-1.5H5.6L5.2 5.5z" fill="white"/>
  </svg>
);

const JsonIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M5.5 2C4.12 2 3 3.12 3 4.5v2c0 .55-.45 1-1 1v1c.55 0 1 .45 1 1v2c0 1.38 1.12 2.5 2.5 2.5h.5v-1h-.5c-.83 0-1.5-.67-1.5-1.5V9.38C4 8.74 3.56 8.2 3 8c.56-.2 1-.74 1-1.38V4.5C4 3.67 4.67 3 5.5 3h.5V2h-.5z" fill="#F5A623"/>
    <path d="M10.5 2c1.38 0 2.5 1.12 2.5 2.5v2c0 .55.45 1 1 1v1c-.55 0-1 .45-1 1v2c0 1.38-1.12 2.5-2.5 2.5H10v-1h.5c.83 0 1.5-.67 1.5-1.5V9.38c0-.64.44-1.18 1-1.38-.56-.2-1-.74-1-1.38V4.5c0-.83-.67-1.5-1.5-1.5H10V2h.5z" fill="#F5A623"/>
  </svg>
);

const RubyIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M3.5 13L2 8l2-5h8l2 5-2 5H4z" fill="#CC342D"/>
    <path d="M8 3.5L4.5 8 8 12.5 11.5 8 8 3.5z" fill="#FFE5E5" fillOpacity="0.3"/>
    <path d="M8 3.5L4.5 8H8V3.5z" fill="white" fillOpacity="0.15"/>
  </svg>
);

const GoIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M1.5 7.5s.2-.3.6-.3c.5 0 2.4.1 2.4.1s-.3.5-.3.7c0 0-2.1 0-2.4-.1-.2-.1-.3-.3-.3-.4z" fill="#00ACD7"/>
    <path d="M8 4C5.6 4 3.5 5.8 3.5 8s2.1 4 4.5 4 4.5-1.8 4.5-4S10.4 4 8 4zm.2 6.5c-1.5 0-2.7-1.1-2.7-2.5S6.7 5.5 8.2 5.5s2.7 1.1 2.7 2.5-1.2 2.5-2.7 2.5z" fill="#00ACD7"/>
    <circle cx="9" cy="7.2" r="0.8" fill="#00ACD7"/>
    <path d="M12.5 6.5c.4 0 .6.1.6.1s.2.1.2.4-.1.4-.1.4-.2.1-.6.1h-1.3s.1-.5.1-.5.1-.5.1-.5h1z" fill="#00ACD7"/>
  </svg>
);

const RustIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="6" stroke="#CE412B" strokeWidth="1.2" fill="none"/>
    <text x="8" y="10.5" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#CE412B" fontFamily="Arial">R</text>
  </svg>
);

const JavaIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M6.2 11.7s-.7.4.5.5c1.4.2 2.2.2 3.7-.2 0 0 .4.3.9.5-3.4 1.4-7.6-.1-5.1-.8zM5.7 10.2s-.8.6.4.7c1.6.1 2.7.1 4.8-.3 0 0 .3.3.7.4-4 1.2-8.5.1-5.9-.8z" fill="#5382A1"/>
    <path d="M9.1 7.3c.8.9-.2 1.8-.2 1.8s2-.1 1.1-2.3c-.9-1.3-1.5-1.9 2-4 0 0-5.5 1.4-2.9 4.5z" fill="#E76F00"/>
    <path d="M12.3 12.8s.5.4-.6.7c-2 .6-8.2.8-10 0-.6-.3.6-.6 1-.7.4-.1.6-.1.6-.1-.7-.5-4.5 1-1.9 1.4 7.1 1.1 12.9-.5 10.9-1.3zM6.5 8.6s-3.2.8-1.1 1c.9.1 2.6.1 4.3-.1 1.3-.1 2.7-.3 2.7-.3s-.5.2-.8.4c-3.3.9-9.6.5-7.8-.4 1.5-.8 2.7-.6 2.7-.6z" fill="#5382A1"/>
  </svg>
);

const CppIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="6" fill="#00599C"/>
    <text x="8" y="10.8" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="white" fontFamily="Arial">C+</text>
  </svg>
);

const CIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="6" fill="#A8B9CC"/>
    <text x="8" y="10.8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="white" fontFamily="Arial">C</text>
  </svg>
);

const CSharpIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="6" fill="#68217A"/>
    <text x="8" y="10.8" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="white" fontFamily="Arial">C#</text>
  </svg>
);

const ShellIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#333" stroke="#555" strokeWidth="0.5"/>
    <path d="M4 9.5l2.5-2L4 5.5" stroke="#4EC9B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="7.5" y1="10" x2="11" y2="10" stroke="#4EC9B0" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const MarkdownIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="#808080" strokeWidth="0.8" fill="none"/>
    <path d="M3.5 10V6l1.75 2.2L7 6v4M9.5 10V6.5l2 2 2-2V10" stroke="#808080" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const SqlIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <ellipse cx="8" cy="4.5" rx="5" ry="2" fill="#E8C74C"/>
    <path d="M3 4.5v7c0 1.1 2.24 2 5 2s5-.9 5-2v-7" stroke="#E8C74C" strokeWidth="0.8" fill="none"/>
    <ellipse cx="8" cy="8" rx="5" ry="2" stroke="#E8C74C" strokeWidth="0.5" fill="none"/>
    <ellipse cx="8" cy="11.5" rx="5" ry="2" stroke="#E8C74C" strokeWidth="0.5" fill="none"/>
  </svg>
);

const PrismaIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M8.5 1.5L13.5 12l-5 2.5L3 5.5l5.5-4z" fill="#2D3748" stroke="#5A67D8" strokeWidth="0.5"/>
    <path d="M8.5 1.5L3 5.5l5.5 9 5-2.5-5-10.5z" fill="#5A67D8" fillOpacity="0.3"/>
  </svg>
);

const VueIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M1.5 2h3.2L8 7.3 11.3 2h3.2L8 14 1.5 2z" fill="#41B883"/>
    <path d="M4.7 2L8 7.3 11.3 2H9L8 3.8 7 2H4.7z" fill="#34495E"/>
  </svg>
);

const SvelteIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M12.5 2.8c-1.6-2.2-4.7-2.6-6.8-1L3 3.8C2.2 4.4 1.7 5.2 1.5 6c-.2 1 0 2 .5 2.8-.3.5-.5 1.1-.5 1.7-.1 1 .2 2 .8 2.8 1.6 2.2 4.7 2.6 6.8 1l2.7-2c.8-.6 1.3-1.4 1.5-2.3.2-1 0-2-.5-2.8.3-.5.5-1.1.5-1.7.1-1-.2-2-.8-2.5z" fill="#FF3E00"/>
    <path d="M6.5 12.3c-1.1.3-2.3-.2-2.8-1.2-.3-.5-.3-1 -.2-1.5l.1-.3.2.2c.5.4 1 .6 1.6.8h.1c-.1.3 0 .7.2 1 .4.5 1.1.6 1.6.3l2.7-2c.2-.2.4-.4.4-.7.1-.3 0-.6-.2-.9-.4-.5-1.1-.6-1.6-.3l-1 .7c-1.2.8-2.8.5-3.6-.7-.4-.5-.5-1.2-.4-1.8.1-.6.5-1.2 1-1.5l2.7-2c1.2-.8 2.8-.5 3.6.7.3.5.5 1 .4 1.5l-.1.3-.2-.2c-.5-.4-1-.6-1.6-.8h-.1c.1-.3 0-.7-.2-1-.4-.5-1.1-.6-1.6-.3l-2.7 2c-.2.2-.4.4-.4.7-.1.3 0 .6.2.9.4.5 1.1.6 1.6.3l1-.7c1.2-.8 2.8-.5 3.6.7.4.5.5 1.2.4 1.8-.1.6-.5 1.2-1 1.5l-2.7 2c-.4.3-.9.4-1.3.4z" fill="white"/>
  </svg>
);

const DockerIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M9 5.5h1.5v1.3H9V5.5zM7 5.5h1.5v1.3H7V5.5zM5 5.5h1.5v1.3H5V5.5zM7 4h1.5v1.3H7V4zM5 4h1.5v1.3H5V4zM3 5.5h1.5v1.3H3V5.5zM5 2.5h1.5v1.3H5V2.5z" fill="#2496ED"/>
    <path d="M14.3 7.2c-.3-.3-.9-.5-1.5-.4-.1-.6-.5-1.2-1-1.5l-.3-.2-.2.3c-.3.4-.4 1-.3 1.5.1.4.2.7.5 1-0.5.3-1.3.4-2.5.4H1.4l-.1.5c-.1.8 0 1.7.4 2.5.4.8 1 1.4 1.7 1.8 1 .5 2.6.7 4.3.4 1.3-.2 2.4-.7 3.4-1.4 1.2-1 2-2.3 2.5-3.9.4 0 1.2 0 1.7-.8l.1-.2-.2-.1c-.3-.2-.8-.3-1.3-.2z" fill="#2496ED"/>
  </svg>
);

const ImageIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="#4CAF50" strokeWidth="0.8" fill="none"/>
    <circle cx="5.5" cy="5.5" r="1.2" fill="#FFC107"/>
    <path d="M2 11l3-3.5 2 2 3-4 4 5.5v.5c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V11z" fill="#4CAF50" fillOpacity="0.5"/>
  </svg>
);

const YamlIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="2" y="2" width="12" height="12" rx="1.5" fill="#CB171E" fillOpacity="0.15" stroke="#CB171E" strokeWidth="0.6"/>
    <text x="8" y="10.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#CB171E" fontFamily="Arial">YML</text>
  </svg>
);

const ConfigIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="8" r="3" stroke="#888" strokeWidth="1" fill="none"/>
    <circle cx="8" cy="8" r="1" fill="#888"/>
    <line x1="8" y1="2" x2="8" y2="4.5" stroke="#888" strokeWidth="0.8"/>
    <line x1="8" y1="11.5" x2="8" y2="14" stroke="#888" strokeWidth="0.8"/>
    <line x1="2" y1="8" x2="4.5" y2="8" stroke="#888" strokeWidth="0.8"/>
    <line x1="11.5" y1="8" x2="14" y2="8" stroke="#888" strokeWidth="0.8"/>
    <line x1="3.8" y1="3.8" x2="5.5" y2="5.5" stroke="#888" strokeWidth="0.8"/>
    <line x1="10.5" y1="10.5" x2="12.2" y2="12.2" stroke="#888" strokeWidth="0.8"/>
    <line x1="3.8" y1="12.2" x2="5.5" y2="10.5" stroke="#888" strokeWidth="0.8"/>
    <line x1="10.5" y1="5.5" x2="12.2" y2="3.8" stroke="#888" strokeWidth="0.8"/>
  </svg>
);

const TextIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M4 2h5.5L12.5 5v9c0 .6-.4 1-1 1h-7c-.6 0-1-.4-1-1V3c0-.6.4-1 1-1z" stroke="#888" strokeWidth="0.8" fill="none"/>
    <path d="M9.5 2v3h3" stroke="#888" strokeWidth="0.6" fill="none"/>
    <line x1="5.5" y1="7" x2="10.5" y2="7" stroke="#888" strokeWidth="0.6"/>
    <line x1="5.5" y1="9" x2="10.5" y2="9" stroke="#888" strokeWidth="0.6"/>
    <line x1="5.5" y1="11" x2="8.5" y2="11" stroke="#888" strokeWidth="0.6"/>
  </svg>
);

const KotlinIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M2 14V2h12L8 8l6 6H2z" fill="url(#kotlin-grad)"/>
    <defs><linearGradient id="kotlin-grad" x1="2" y1="2" x2="14" y2="14"><stop stopColor="#E44857"/><stop offset="0.5" stopColor="#C711E1"/><stop offset="1" stopColor="#7F52FF"/></linearGradient></defs>
  </svg>
);

const XmlIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M5.5 4L2.5 8l3 4" stroke="#E37933" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M10.5 4l3 4-3 4" stroke="#E37933" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="9" y1="3" x2="7" y2="13" stroke="#E37933" strokeWidth="0.8"/>
  </svg>
);

const LockIcon: SvgIcon = (props) => (
  <svg viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="#B8860B" fillOpacity="0.2" stroke="#B8860B" strokeWidth="0.8"/>
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="#B8860B" strokeWidth="0.8" fill="none"/>
    <circle cx="8" cy="10" r="1" fill="#B8860B"/>
  </svg>
);

// --- Icon mapping by extension and filename ---

const EXT_ICON_MAP: Record<string, SvgIcon> = {
  py: PythonIcon, pyw: PythonIcon, pyx: PythonIcon,
  js: JavaScriptIcon, mjs: JavaScriptIcon, cjs: JavaScriptIcon,
  ts: TypeScriptIcon, mts: TypeScriptIcon, cts: TypeScriptIcon,
  jsx: ReactIcon, tsx: ReactIcon,
  html: HtmlIcon, htm: HtmlIcon,
  css: CssIcon, scss: CssIcon, less: CssIcon, sass: CssIcon,
  json: JsonIcon,
  rb: RubyIcon, erb: RubyIcon,
  go: GoIcon,
  rs: RustIcon,
  java: JavaIcon,
  kt: KotlinIcon, kts: KotlinIcon,
  c: CIcon, h: CIcon,
  cpp: CppIcon, cc: CppIcon, cxx: CppIcon, hpp: CppIcon, hxx: CppIcon,
  cs: CSharpIcon,
  sh: ShellIcon, bash: ShellIcon, zsh: ShellIcon, fish: ShellIcon,
  md: MarkdownIcon, mdx: MarkdownIcon,
  sql: SqlIcon,
  prisma: PrismaIcon,
  vue: VueIcon,
  svelte: SvelteIcon,
  yaml: YamlIcon, yml: YamlIcon,
  toml: ConfigIcon,
  xml: XmlIcon, xsl: XmlIcon,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon, gif: ImageIcon,
  svg: ImageIcon, webp: ImageIcon, ico: ImageIcon, bmp: ImageIcon,
  txt: TextIcon, log: TextIcon,
  lock: LockIcon,
  env: ConfigIcon,
  dockerfile: DockerIcon,
  csv: TextIcon,
};

const FILENAME_ICON_MAP: Record<string, SvgIcon> = {
  "dockerfile": DockerIcon,
  "docker-compose.yml": DockerIcon,
  "docker-compose.yaml": DockerIcon,
  ".gitignore": ConfigIcon,
  ".eslintrc": ConfigIcon,
  ".eslintrc.js": ConfigIcon,
  ".eslintrc.json": ConfigIcon,
  ".prettierrc": ConfigIcon,
  ".prettierrc.json": ConfigIcon,
  "tsconfig.json": TypeScriptIcon,
  "vite.config.ts": ConfigIcon,
  "tailwind.config.ts": CssIcon,
  "tailwind.config.js": CssIcon,
};

function getFileIcon(filePath: string): SvgIcon {
  const fileName = filePath.split("/").pop()?.toLowerCase() || "";
  if (FILENAME_ICON_MAP[fileName]) return FILENAME_ICON_MAP[fileName];

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return EXT_ICON_MAP[ext] || (() => <File className="h-full w-full text-muted-foreground" />);
}

export function DiffFileList({ files, diff }: DiffFileListProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      {files.map((file) => {
        const config = STATUS_CONFIG[file.status];
        const fileName = file.path.split("/").pop() || file.path;
        const dirPath = file.path.split("/").slice(0, -1).join("/");
        const isExpanded = expandedFiles.has(file.path);
        const Icon = getFileIcon(file.path);

        return (
          <div key={file.path} className="border-b border-border/40 last:border-b-0">
            {/* File header */}
            <button
              onClick={() => toggleFile(file.path)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                "hover:bg-accent/50",
                isExpanded && "bg-accent/30"
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  isExpanded && "rotate-90"
                )}
              />

              <span className="h-4 w-4 shrink-0">
                <Icon className="h-4 w-4" />
              </span>

              <span className="text-xs font-medium truncate">{fileName}</span>

              {dirPath && (
                <span className="text-[10px] text-muted-foreground/50 truncate font-mono">
                  {dirPath}
                </span>
              )}

              <div className="ml-auto flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  {file.additions > 0 && (
                    <span className="text-green-500">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-500">-{file.deletions}</span>
                  )}
                </div>

                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold",
                    config.bg,
                    config.color
                  )}
                >
                  {config.letter}
                </span>
              </div>
            </button>

            {/* Expanded diff */}
            {isExpanded && diff && (
              <div className="border-t border-border/30">
                <DiffViewer diff={diff} fileName={file.path} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
