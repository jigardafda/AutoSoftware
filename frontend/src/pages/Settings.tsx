import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h3 className="text-white font-medium mb-4">Profile</h3>
        <div className="flex items-center gap-4">
          {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full" />}
          <div><p className="text-white text-lg">{user?.name || "No name"}</p><p className="text-zinc-400">{user?.email}</p></div>
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h3 className="text-white font-medium mb-4">Connected Providers</h3>
        <div className="space-y-3">
          {["github", "gitlab", "bitbucket"].map((provider) => {
            const connected = user?.providers.includes(provider);
            return (
              <div key={provider} className="flex items-center justify-between">
                <span className="text-white capitalize">{provider}</span>
                {connected ? <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">Connected</span> : <a href={`/api/auth/login/${provider}`} className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Connect</a>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-medium mb-4">Environment</h3>
        <p className="text-sm text-zinc-400">Required environment variables:</p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-500 font-mono">
          <li>ANTHROPIC_API_KEY</li><li>DATABASE_URL</li><li>GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET</li><li>GITLAB_CLIENT_ID / GITLAB_CLIENT_SECRET</li><li>BITBUCKET_CLIENT_ID / BITBUCKET_CLIENT_SECRET</li>
        </ul>
      </div>
    </div>
  );
}
