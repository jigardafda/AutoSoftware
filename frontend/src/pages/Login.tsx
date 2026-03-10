import { Github, Gitlab, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoIcon } from "@/components/Logo";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5002";

export function Login() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(-45deg, var(--color-primary), #7c3aed, var(--color-primary), var(--color-background))",
          backgroundSize: "400% 400%",
          animation: "gradient-shift 15s ease infinite",
        }}
      />

      {/* Frosted glass card */}
      <div className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-8 sm:p-10">
        {/* Logo / Wordmark */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <LogoIcon className="h-12 w-12" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            AutoSoftware
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-muted-foreground text-center text-sm mb-8">
          AI-powered code analysis and improvement
        </p>

        {/* OAuth buttons */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className="relative w-full h-12 text-base hover:bg-accent/80"
            asChild
          >
            <a href={`${BACKEND_URL}/api/auth/login/github`}>
              <Github className="!size-5 absolute left-4" />
              <span>Continue with GitHub</span>
            </a>
          </Button>

          <Button
            className="relative w-full h-12 text-base bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
            asChild
          >
            <a href={`${BACKEND_URL}/api/auth/login/gitlab`}>
              <Gitlab className="!size-5 absolute left-4" />
              <span>Continue with GitLab</span>
            </a>
          </Button>

          <Button
            className="relative w-full h-12 text-base bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            asChild
          >
            <a href={`${BACKEND_URL}/api/auth/login/bitbucket`}>
              <svg
                className="!size-5 absolute left-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.32 0 .6-.22.66-.53L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.9L8.72 9.05h6.56l-1.18 5.9z" />
              </svg>
              <span>Continue with Bitbucket</span>
            </a>
          </Button>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>Secure OAuth authentication — we never store your password</span>
        </div>
      </div>
    </div>
  );
}
