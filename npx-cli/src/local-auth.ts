import crypto from "node:crypto";
import chalk from "chalk";

const LOCAL_USER_EMAIL = "local@autosoftware.local";
const LOCAL_USER_NAME = "Local User";

export interface LocalUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Ensures a local user exists in the database.
 * Creates one on first boot; returns the existing user on subsequent boots.
 */
export async function ensureLocalUser(prisma: any): Promise<LocalUser> {
  try {
    const user = await prisma.user.upsert({
      where: { email: LOCAL_USER_EMAIL },
      create: {
        email: LOCAL_USER_EMAIL,
        name: LOCAL_USER_NAME,
        avatarUrl: null,
      },
      update: {},
    });

    console.log(
      chalk.green(`Local user ready: ${user.email} (${user.id})`)
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? LOCAL_USER_NAME,
    };
  } catch (err) {
    console.error(chalk.red("Failed to create local user:"), err);
    throw err;
  }
}

/**
 * Generates a signed session cookie value for local mode.
 * Uses the same cookie-signing mechanism as @fastify/cookie.
 */
export function generateSessionCookie(
  userId: string,
  sessionSecret: string
): string {
  // @fastify/cookie signs with HMAC-SHA256, base64 encoded, prefixed with the value
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(userId)
    .digest("base64")
    .replace(/=+$/, "");
  return `${userId}.${signature}`;
}

/**
 * Returns the auto-login middleware that sets the session cookie
 * and redirects unauthenticated requests to auto-login.
 */
export function createAutoLoginHook(
  userId: string,
  sessionSecret: string
) {
  const signedCookie = generateSessionCookie(userId, sessionSecret);

  return async (request: any, reply: any) => {
    // If the request already has a valid session, skip
    if (request.userId) {
      return;
    }

    // For API requests that need auth, auto-set the cookie
    const isApiRequest =
      request.url.startsWith("/api/") || request.url.startsWith("/embed/");
    const isAuthEndpoint = request.url.startsWith("/api/auth/");

    if (isApiRequest && !isAuthEndpoint) {
      // Set the session cookie so subsequent hooks pick it up
      reply.setCookie("session_token", userId, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
      // Also set the userId directly on the request for this request
      request.userId = userId;
    }
  };
}
