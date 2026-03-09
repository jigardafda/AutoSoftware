import { Github } from "lucide-react";

export function Login() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-2">AutoSoftware</h1>
        <p className="text-zinc-400 text-center mb-8">
          Automated code analysis and improvement
        </p>
        <div className="space-y-3">
          <a
            href="/api/auth/login/github"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            <Github size={20} />
            Continue with GitHub
          </a>
          <a
            href="/api/auth/login/gitlab"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            Continue with GitLab
          </a>
          <a
            href="/api/auth/login/bitbucket"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Continue with Bitbucket
          </a>
        </div>
      </div>
    </div>
  );
}
