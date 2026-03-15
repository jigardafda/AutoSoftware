import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getAuthUrl, exchangeCode, getUserInfo } from "../services/oauth.js";
import type { OAuthProvider } from "@autosoftware/shared";

const execFileAsync = promisify(execFile);
const validProviders = new Set(["github", "gitlab", "bitbucket"]);

// Flow types for OAuth
type OAuthFlow = "login" | "connect";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { provider: string } }>(
    "/login/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!validProviders.has(provider)) {
        return reply.code(400).send({ error: { message: "Invalid provider" } });
      }

      const state = crypto.randomBytes(16).toString("hex");
      reply.setCookie("oauth_state", state, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });
      // Mark this as a login flow
      reply.setCookie("oauth_flow", "login", {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });

      const url = getAuthUrl(provider as OAuthProvider, state);
      return reply.redirect(url);
    }
  );

  // Connect a provider to an existing logged-in user
  app.get<{ Params: { provider: string } }>(
    "/connect/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!validProviders.has(provider)) {
        return reply.code(400).send({ error: { message: "Invalid provider" } });
      }

      // Must be logged in to connect
      if (!request.userId) {
        return reply.code(401).send({ error: { message: "Must be logged in to connect accounts" } });
      }

      const state = crypto.randomBytes(16).toString("hex");
      reply.setCookie("oauth_state", state, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });
      // Mark this as a connect flow and store user ID
      reply.setCookie("oauth_flow", "connect", {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });
      reply.setCookie("oauth_user_id", request.userId, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });

      const url = getAuthUrl(provider as OAuthProvider, state);
      return reply.redirect(url);
    }
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>(
    "/callback/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      const { code, state } = request.query;

      if (!validProviders.has(provider) || !code || !state) {
        return reply.redirect(`${config.frontendUrl}/login?error=invalid_request`);
      }

      const savedState = request.unsignCookie(request.cookies.oauth_state || "");
      if (!savedState.valid || savedState.value !== state) {
        return reply.redirect(`${config.frontendUrl}/login?error=invalid_state`);
      }

      // Determine the flow type (login or connect)
      const flowCookie = request.unsignCookie(request.cookies.oauth_flow || "");
      const flow: OAuthFlow = (flowCookie.valid && flowCookie.value === "connect") ? "connect" : "login";
      const connectUserIdCookie = request.unsignCookie(request.cookies.oauth_user_id || "");

      try {
        const tokens = await exchangeCode(provider as OAuthProvider, code);
        const userInfo = await getUserInfo(provider as OAuthProvider, tokens.access_token);

        let userId: string;

        if (flow === "connect" && connectUserIdCookie.valid && connectUserIdCookie.value) {
          // Connect flow: link the account to the existing user
          userId = connectUserIdCookie.value;

          // Verify the user still exists
          const existingUser = await prisma.user.findUnique({ where: { id: userId } });
          if (!existingUser) {
            return reply.redirect(`${config.frontendUrl}/settings?error=user_not_found`);
          }

          // Check if this provider account is already linked to another user
          const existingAccount = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: provider as OAuthProvider,
                providerAccountId: userInfo.id,
              },
            },
          });

          if (existingAccount && existingAccount.userId !== userId) {
            // This GitHub account is linked to a different user
            return reply.redirect(`${config.frontendUrl}/settings?error=account_linked_to_other_user`);
          }

          // Link the account to the current user
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: provider as OAuthProvider,
                providerAccountId: userInfo.id,
              },
            },
            create: {
              userId,
              provider: provider as OAuthProvider,
              providerAccountId: userInfo.id,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || null,
              expiresAt: tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000)
                : null,
            },
            update: {
              userId, // Update to current user if reconnecting
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt: tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000)
                : undefined,
            },
          });

          // Clear OAuth cookies
          reply.clearCookie("oauth_state", { path: "/" });
          reply.clearCookie("oauth_flow", { path: "/" });
          reply.clearCookie("oauth_user_id", { path: "/" });

          // Redirect to settings with success
          return reply.redirect(`${config.frontendUrl}/settings?connected=${provider}`);
        } else {
          // Login flow: create or update user based on email
          const user = await prisma.user.upsert({
            where: { email: userInfo.email },
            create: {
              email: userInfo.email,
              name: userInfo.name,
              avatarUrl: userInfo.avatarUrl,
            },
            update: {
              name: userInfo.name || undefined,
              avatarUrl: userInfo.avatarUrl || undefined,
            },
          });

          userId = user.id;

          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: provider as OAuthProvider,
                providerAccountId: userInfo.id,
              },
            },
            create: {
              userId: user.id,
              provider: provider as OAuthProvider,
              providerAccountId: userInfo.id,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || null,
              expiresAt: tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000)
                : null,
            },
            update: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt: tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000)
                : undefined,
            },
          });

          reply.clearCookie("oauth_state", { path: "/" });
          reply.clearCookie("oauth_flow", { path: "/" });
          reply.setCookie("session_token", user.id, {
            path: "/",
            httpOnly: true,
            signed: true,
            maxAge: 60 * 60 * 24 * 30,
            sameSite: "lax",
          });

          return reply.redirect(`${config.frontendUrl}/dashboard`);
        }
      } catch (err) {
        app.log.error(err);
        reply.clearCookie("oauth_state", { path: "/" });
        reply.clearCookie("oauth_flow", { path: "/" });
        reply.clearCookie("oauth_user_id", { path: "/" });
        return reply.redirect(`${config.frontendUrl}/login?error=auth_failed`);
      }
    }
  );

  // Disconnect a provider from the current user
  app.post<{ Params: { provider: string } }>(
    "/disconnect/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!validProviders.has(provider)) {
        return reply.code(400).send({ error: { message: "Invalid provider" } });
      }

      if (!request.userId) {
        return reply.code(401).send({ error: { message: "Unauthorized" } });
      }

      // Find and delete the account link
      const deleted = await prisma.account.deleteMany({
        where: {
          userId: request.userId,
          provider: provider as OAuthProvider,
        },
      });

      if (deleted.count === 0) {
        return reply.code(404).send({ error: { message: "Provider not connected" } });
      }

      return { data: { success: true, provider } };
    }
  );

  app.get("/me", async (request, reply) => {
    // In local mode with no real session, return 401 so the frontend shows "not signed in"
    if (!request.userId || (request as any).isLocalAuth) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      include: { accounts: { select: { provider: true } } },
    });

    if (!user) {
      return reply.code(401).send({ error: { message: "User not found" } });
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        providers: user.accounts.map((a) => a.provider),
      },
    };
  });

  app.post("/logout", async (request, reply) => {
    reply.clearCookie("session_token", { path: "/" });
    return { data: { success: true } };
  });

  // ── GitHub CLI Auth ──

  // Check if gh CLI is authenticated
  app.get("/github-status", async (_request, reply) => {
    // 1. Check if gh CLI is even installed
    try {
      await execFileAsync("which", ["gh"], { timeout: 3000 });
    } catch {
      return { data: { installed: false, authenticated: false, username: null } };
    }

    // 2. Check if gh is authenticated
    try {
      const { stdout: token } = await execFileAsync("gh", ["auth", "token"], { timeout: 5000 });
      if (!token.trim()) {
        return { data: { installed: true, authenticated: false, username: null } };
      }

      // 3. Get username
      let username: string | null = null;
      try {
        const { stdout } = await execFileAsync("gh", ["api", "user", "--jq", ".login"], { timeout: 5000 });
        username = stdout.trim() || null;
      } catch {
        // Token exists but user query failed — still authenticated
      }

      return { data: { installed: true, authenticated: true, username } };
    } catch {
      return { data: { installed: true, authenticated: false, username: null } };
    }
  });

  // Start gh auth login and stream output via SSE
  app.get("/gh-login", async (_request, reply) => {
    // Check gh is installed
    try {
      await execFileAsync("which", ["gh"], { timeout: 3000 });
    } catch {
      return reply.code(400).send({
        error: { message: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com" },
      });
    }

    // Set up SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("status", { message: "Starting GitHub authentication..." });

    const child = spawn("gh", ["auth", "login", "--web", "--git-protocol", "https", "--skip-ssh-key"], {
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      sendEvent("output", { text });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      sendEvent("output", { text });
    });

    child.on("close", async (code) => {
      if (code === 0) {
        // Get the token and username
        let username: string | null = null;
        try {
          const { stdout } = await execFileAsync("gh", ["api", "user", "--jq", ".login"], { timeout: 5000 });
          username = stdout.trim() || null;
        } catch {}

        sendEvent("success", { message: "GitHub authentication successful!", username });
      } else {
        sendEvent("error", { message: `Authentication failed (exit code ${code})` });
      }
      reply.raw.end();
    });

    child.on("error", (err) => {
      sendEvent("error", { message: `Failed to start gh: ${err.message}` });
      reply.raw.end();
    });

    // Close stdin immediately — gh auth login --web doesn't need stdin input
    child.stdin.end();

    // Handle client disconnect
    reply.raw.on("close", () => {
      try { child.kill("SIGTERM"); } catch {}
    });
  });

  // Dev login endpoint - only works in development
  app.post<{ Body: { email: string } }>(
    "/dev-login",
    async (request, reply) => {
      // Only allow in development mode
      if (process.env.NODE_ENV === "production") {
        return reply.code(403).send({ error: { message: "Dev login not available in production" } });
      }

      const { email } = request.body;

      // Pre-seeded admin user
      const allowedEmails = ["admin@autosoftware.com"];
      if (!allowedEmails.includes(email)) {
        return reply.code(403).send({ error: { message: "Email not authorized for dev login" } });
      }

      // Upsert the admin user
      const user = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name: "Admin User",
          avatarUrl: null,
        },
        update: {},
      });

      // Set session cookie
      reply.setCookie("session_token", user.id, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
        sameSite: "lax",
      });

      return {
        data: {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        },
      };
    }
  );
};
