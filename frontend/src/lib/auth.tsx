import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providers: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  localMode: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

/** Detect local/CLI mode synchronously from injected global or fall back to API */
function detectLocalMode(): boolean {
  return !!(window as any).__LOCAL_MODE__;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalMode] = useState(detectLocalMode);

  useEffect(() => {
    (async () => {
      try {
        // If not already detected from injected global, check the API
        if (!localMode) {
          try {
            const config = await api.config.get();
            if (config.localMode) setLocalMode(true);
          } catch {
            // Config endpoint missing — not local mode
          }
        }

        // Try fetching the current user (works if already logged in via OAuth)
        try {
          const u = await api.auth.me();
          setUser(u);
        } catch {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchUser = async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, localMode, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
