import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getAuthUrl, exchangeCode, getUserInfo } from "../services/oauth.js";
import type { OAuthProvider } from "@autosoftware/shared";

const validProviders = new Set(["github", "gitlab", "bitbucket"]);

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

      try {
        const tokens = await exchangeCode(provider as OAuthProvider, code);
        const userInfo = await getUserInfo(provider as OAuthProvider, tokens.access_token);

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
        reply.setCookie("session_token", user.id, {
          path: "/",
          httpOnly: true,
          signed: true,
          maxAge: 60 * 60 * 24 * 30,
          sameSite: "lax",
        });

        return reply.redirect(`${config.frontendUrl}/dashboard`);
      } catch (err) {
        app.log.error(err);
        return reply.redirect(`${config.frontendUrl}/login?error=auth_failed`);
      }
    }
  );

  app.get("/me", async (request, reply) => {
    if (!request.userId) {
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
};
