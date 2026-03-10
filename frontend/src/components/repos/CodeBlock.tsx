import { useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/lib/theme";

interface CodeBlockProps {
  code: string;
  language?: string;
  highlightLine?: number;
}

export function CodeBlock({ code, language, highlightLine }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === "dark" ? oneDark : oneLight;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightLine || !containerRef.current) return;

    // Small delay to let SyntaxHighlighter render
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(
        `[data-line="${highlightLine}"]`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [highlightLine, code]);

  const highlightBg =
    resolvedTheme === "dark"
      ? "rgba(250, 204, 21, 0.15)"
      : "rgba(250, 204, 21, 0.3)";

  return (
    <div ref={containerRef}>
      <SyntaxHighlighter
        language={language}
        style={style}
        showLineNumbers
        wrapLines
        lineProps={(lineNumber: number) => {
          const props: React.HTMLProps<HTMLElement> & { "data-line"?: number } = {
            style: {},
            "data-line": lineNumber,
          };
          if (highlightLine && lineNumber === highlightLine) {
            props.style = {
              backgroundColor: highlightBg,
              display: "block",
              borderLeft: "3px solid #facc15",
              marginLeft: "-3px",
            };
          }
          return props;
        }}
        customStyle={{
          margin: 0,
          borderRadius: "0.375rem",
          fontSize: "13px",
        }}
        codeTagProps={{
          style: { fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
