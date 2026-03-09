import type { OAuthProvider } from "@autosoftware/shared";
import { config } from "../config.js";
import { OAUTH_CONFIGS } from "@autosoftware/shared";

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

interface OAuthUserInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function getClientCredentials(provider: OAuthProvider) {
  return {
    clientId: config[provider].clientId,
    clientSecret: config[provider].clientSecret,
  };
}

export function getAuthUrl(provider: OAuthProvider, state: string): string {
  const oauthConfig = OAUTH_CONFIGS[provider];
  const { clientId } = getClientCredentials(provider);
  const redirectUri = `${config.backendUrl}/api/auth/callback/${provider}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    ...(provider === "bitbucket"
      ? { response_type: "code" }
      : { response_type: "code", scope: oauthConfig.scopes }),
  });

  return `${oauthConfig.authUrl}?${params}`;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string
): Promise<OAuthTokenResponse> {
  const oauthConfig = OAUTH_CONFIGS[provider];
  const { clientId, clientSecret } = getClientCredentials(provider);
  const redirectUri = `${config.backendUrl}/api/auth/callback/${provider}`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (provider === "bitbucket") {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }

  const res = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return res.json();
}

export async function getUserInfo(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthUserInfo> {
  const oauthConfig = OAUTH_CONFIGS[provider];

  const res = await fetch(oauthConfig.userUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!res.ok) throw new Error("Failed to fetch user info");
  const data = await res.json();

  switch (provider) {
    case "github": {
      let email = data.email;
      if (!email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (emailRes.ok) {
          const emails = await emailRes.json();
          const primary = emails.find((e: any) => e.primary);
          email = primary?.email || emails[0]?.email;
        }
      }
      return { id: String(data.id), email, name: data.name, avatarUrl: data.avatar_url };
    }
    case "gitlab":
      return { id: String(data.id), email: data.email, name: data.name, avatarUrl: data.avatar_url };
    case "bitbucket":
      return {
        id: data.account_id || data.uuid,
        email: data.email || `${data.username}@bitbucket.org`,
        name: data.display_name,
        avatarUrl: data.links?.avatar?.href || null,
      };
  }
}
