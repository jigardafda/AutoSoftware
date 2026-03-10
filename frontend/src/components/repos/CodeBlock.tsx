import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/lib/theme";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === "dark" ? oneDark : oneLight;

  return (
    <SyntaxHighlighter
      language={language}
      style={style}
      showLineNumbers
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
  );
}
