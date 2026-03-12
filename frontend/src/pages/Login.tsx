import { useState } from "react";
import { Github, Gitlab, Shield, Sparkles, Zap, GitBranch, KeyRound } from "lucide-react";
import { LogoIcon } from "@/components/Logo";
import { api } from "@/lib/api";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5002";
const IS_DEV = import.meta.env.DEV;

export function Login() {
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const handleDevLogin = async () => {
    setDevLoading(true);
    setDevError(null);
    try {
      await api.auth.devLogin("admin@autosoftware.com");
      window.location.href = "/dashboard";
    } catch (err: any) {
      setDevError(err.message || "Dev login failed");
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex overflow-hidden">
      {/* Background - Lighter slate with gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[oklch(0.18_0.02_250)] via-[oklch(0.14_0.025_260)] to-[oklch(0.16_0.03_220)]">
        {/* Animated gradient orbs - more visible */}
        <div
          className="absolute top-[-10%] left-[-5%] w-[700px] h-[700px] rounded-full animate-pulse"
          style={{
            background: "radial-gradient(circle, oklch(0.55 0.18 195 / 0.35) 0%, transparent 60%)",
            filter: "blur(60px)",
            animationDuration: "8s",
          }}
        />
        <div
          className="absolute bottom-[-20%] right-[-5%] w-[800px] h-[800px] rounded-full"
          style={{
            background: "radial-gradient(circle, oklch(0.50 0.16 280 / 0.3) 0%, transparent 60%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute top-[30%] right-[15%] w-[500px] h-[500px] rounded-full animate-pulse"
          style={{
            background: "radial-gradient(circle, oklch(0.60 0.14 145 / 0.25) 0%, transparent 60%)",
            filter: "blur(50px)",
            animationDuration: "10s",
          }}
        />
        <div
          className="absolute top-[60%] left-[20%] w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, oklch(0.55 0.12 45 / 0.2) 0%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />

        {/* Subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(oklch(0.9 0 0 / 0.15) 1px, transparent 1px),
              linear-gradient(90deg, oklch(0.9 0 0 / 0.15) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* Left side - Branding & features (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 text-white">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <LogoIcon className="h-11 w-11 text-[oklch(0.75_0.16_195)]" />
            <span className="text-2xl font-bold tracking-tight">AutoSoftware</span>
          </div>
          <p className="text-[oklch(0.65_0.02_250)] text-sm font-medium">
            Autonomous code improvement platform
          </p>
        </div>

        <div className="space-y-10 stagger-children max-w-lg">
          <FeatureItem
            icon={<Zap className="h-5 w-5" />}
            title="AI-Powered Analysis"
            description="Deep codebase scanning identifies security vulnerabilities, bugs, and improvement opportunities."
            color="195"
          />
          <FeatureItem
            icon={<GitBranch className="h-5 w-5" />}
            title="Automated PRs"
            description="Get production-ready pull requests with detailed explanations and test coverage."
            color="145"
          />
          <FeatureItem
            icon={<Sparkles className="h-5 w-5" />}
            title="Continuous Improvement"
            description="Schedule scans and let AI continuously enhance your codebase quality."
            color="280"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-[oklch(0.65_0.15_195)] to-[oklch(0.55_0.15_250)] border-2 border-[oklch(0.16_0.025_260)]"
              />
            ))}
          </div>
          <p className="text-[oklch(0.55_0.02_250)] text-sm">
            Trusted by <span className="text-[oklch(0.75_0.16_195)] font-medium">2,000+</span> engineering teams
          </p>
        </div>
      </div>

      {/* Right side - Login card */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[420px] animate-scale-in">
          {/* Card with glassmorphism effect */}
          <div className="relative">
            {/* Gradient border glow */}
            <div
              className="absolute -inset-[1px] rounded-3xl opacity-70"
              style={{
                background: "linear-gradient(135deg, oklch(0.75 0.16 195 / 0.6), oklch(0.60 0.18 280 / 0.4), oklch(0.70 0.14 145 / 0.4))",
              }}
            />

            {/* Card content */}
            <div className="relative bg-[oklch(0.16_0.02_250_/_0.85)] backdrop-blur-xl rounded-3xl p-8 sm:p-10 border border-[oklch(0.30_0.02_250)]">
              {/* Mobile logo */}
              <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
                <LogoIcon className="h-11 w-11 text-[oklch(0.75_0.16_195)]" />
                <span className="text-2xl font-bold tracking-tight text-white">AutoSoftware</span>
              </div>

              {/* Heading */}
              <div className="mb-8 lg:mb-10">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
                  Welcome back
                </h1>
                <p className="text-[oklch(0.65_0.02_250)] text-sm">
                  Sign in to continue to your dashboard
                </p>
              </div>

              {/* OAuth buttons */}
              <div className="space-y-3">
                <OAuthButton
                  href={`${BACKEND_URL}/api/auth/login/github`}
                  icon={<Github className="h-5 w-5" />}
                  label="Continue with GitHub"
                  variant="github"
                />

                <OAuthButton
                  href={`${BACKEND_URL}/api/auth/login/gitlab`}
                  icon={<Gitlab className="h-5 w-5" />}
                  label="Continue with GitLab"
                  variant="gitlab"
                />

                <OAuthButton
                  href={`${BACKEND_URL}/api/auth/login/bitbucket`}
                  icon={
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.32 0 .6-.22.66-.53L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.9L8.72 9.05h6.56l-1.18 5.9z" />
                    </svg>
                  }
                  label="Continue with Bitbucket"
                  variant="bitbucket"
                />
              </div>

              {/* Dev login - only in development */}
              {IS_DEV && (
                <div className="mt-6 pt-6 border-t border-[oklch(0.30_0.02_250)]">
                  <p className="text-xs text-[oklch(0.55_0.02_250)] text-center mb-3">
                    Development Mode
                  </p>
                  <button
                    onClick={handleDevLogin}
                    disabled={devLoading}
                    className={`
                      flex items-center justify-center gap-3 w-full h-12 rounded-xl
                      font-medium text-sm transition-all duration-200
                      bg-gradient-to-r from-[oklch(0.45_0.12_145)] to-[oklch(0.40_0.12_160)]
                      text-white hover:from-[oklch(0.42_0.12_145)] hover:to-[oklch(0.37_0.12_160)]
                      shadow-lg shadow-[oklch(0.40_0.12_145_/_0.3)]
                      hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0
                    `}
                  >
                    <KeyRound className="h-5 w-5" />
                    <span>{devLoading ? "Logging in..." : "Dev Login (admin@autosoftware.com)"}</span>
                  </button>
                  {devError && (
                    <p className="text-xs text-red-400 text-center mt-2">{devError}</p>
                  )}
                </div>
              )}

              {/* Security note */}
              <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-[oklch(0.30_0.02_250)]">
                <Shield className="h-4 w-4 text-[oklch(0.55_0.02_250)]" />
                <span className="text-[oklch(0.55_0.02_250)] text-xs">
                  Secure OAuth — we never store your password
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="flex gap-4 group">
      <div
        className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
        style={{
          background: `linear-gradient(135deg, oklch(0.65 0.14 ${color} / 0.25), oklch(0.55 0.12 ${color} / 0.15))`,
          color: `oklch(0.75 0.14 ${color})`,
          boxShadow: `0 4px 20px oklch(0.55 0.14 ${color} / 0.15)`,
        }}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-white mb-1.5 text-[15px]">{title}</h3>
        <p className="text-sm text-[oklch(0.60_0.02_250)] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function OAuthButton({
  href,
  icon,
  label,
  variant,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  variant: "github" | "gitlab" | "bitbucket";
}) {
  const styles = {
    github: {
      bg: "bg-white",
      text: "text-[oklch(0.20_0.02_250)]",
      hover: "hover:bg-[oklch(0.96_0_0)]",
      shadow: "shadow-lg shadow-white/10",
    },
    gitlab: {
      bg: "bg-gradient-to-r from-[oklch(0.58_0.18_40)] to-[oklch(0.55_0.16_50)]",
      text: "text-white",
      hover: "hover:from-[oklch(0.54_0.18_40)] hover:to-[oklch(0.51_0.16_50)]",
      shadow: "shadow-lg shadow-[oklch(0.55_0.18_40_/_0.3)]",
    },
    bitbucket: {
      bg: "bg-gradient-to-r from-[oklch(0.55_0.15_240)] to-[oklch(0.50_0.15_250)]",
      text: "text-white",
      hover: "hover:from-[oklch(0.51_0.15_240)] hover:to-[oklch(0.46_0.15_250)]",
      shadow: "shadow-lg shadow-[oklch(0.50_0.15_240_/_0.3)]",
    },
  };

  const style = styles[variant];

  return (
    <a
      href={href}
      className={`
        relative flex items-center justify-center gap-3 w-full h-12 rounded-xl
        font-medium text-sm transition-all duration-200
        ${style.bg} ${style.text} ${style.hover} ${style.shadow}
        hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]
      `}
    >
      <span className="absolute left-4">{icon}</span>
      <span>{label}</span>
    </a>
  );
}
