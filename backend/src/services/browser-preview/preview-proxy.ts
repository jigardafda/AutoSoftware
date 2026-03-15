import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import http from "http";
import { URL } from "url";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DEVTOOLS_BRIDGE_SCRIPT } from "./devtools-bridge.js";

// Load bippy bundle JS — must be injected in <head> BEFORE React loads
const __dirname_proxy = dirname(fileURLToPath(import.meta.url));
const BIPPY_BUNDLE = readFileSync(
  join(__dirname_proxy, "bippy-bundle.js"),
  "utf-8"
);
const BIPPY_SCRIPT_TAG = `<script data-autosoftware-bippy>${BIPPY_BUNDLE}</script>`;

interface ProxyConfig {
  targetHost: string;
  targetPort: number;
}

/**
 * Proxies requests to the user's local dev server and injects
 * the DevTools bridge script into HTML responses.
 */
function proxyRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  config: ProxyConfig,
  path: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const targetUrl = `http://${config.targetHost}:${config.targetPort}${path}`;

    const parsedUrl = new URL(targetUrl);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${config.targetHost}:${config.targetPort}`,
      },
    };

    // Remove headers that cause issues with proxy
    delete (options.headers as Record<string, any>)["accept-encoding"]; // We need to read and modify HTML

    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";
      const isHTML = contentType.includes("text/html");
      const statusCode = proxyRes.statusCode || 200;

      if (isHTML) {
        // Collect HTML response to inject devtools bridge
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => chunks.push(chunk));
        proxyRes.on("end", () => {
          let html = Buffer.concat(chunks).toString("utf-8");

          // Inject bippy in <head> BEFORE React loads (critical for fiber detection)
          if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head[^>]*>/i, "$&" + BIPPY_SCRIPT_TAG);
          } else {
            // No <head> tag — prepend bippy so it loads before any scripts
            html = BIPPY_SCRIPT_TAG + html;
          }

          // Inject devtools bridge before </body> or at end
          if (html.includes("</body>")) {
            html = html.replace("</body>", DEVTOOLS_BRIDGE_SCRIPT + "</body>");
          } else if (html.includes("</html>")) {
            html = html.replace("</html>", DEVTOOLS_BRIDGE_SCRIPT + "</html>");
          } else {
            html += DEVTOOLS_BRIDGE_SCRIPT;
          }

          // Forward response headers (except content-length since we modified the body)
          const headers: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (
              key.toLowerCase() !== "content-length" &&
              key.toLowerCase() !== "content-encoding" &&
              key.toLowerCase() !== "transfer-encoding" &&
              value
            ) {
              headers[key] = value as string | string[];
            }
          }
          headers["content-length"] = Buffer.byteLength(html).toString();
          // Allow iframe embedding
          delete headers["x-frame-options"];
          delete headers["content-security-policy"];

          reply.code(statusCode).headers(headers).send(html);
          resolve();
        });
      } else {
        // Non-HTML: stream through directly
        const headers: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) {
            headers[key] = value as string | string[];
          }
        }
        // Allow iframe embedding for all resources
        delete headers["x-frame-options"];
        delete headers["content-security-policy"];

        reply.code(statusCode).headers(headers);
        proxyRes.pipe(reply.raw);
        proxyRes.on("end", resolve);
      }
    });

    proxyReq.on("error", (err) => {
      reply.code(502).send({
        error: "Proxy error",
        message: `Could not connect to dev server at ${config.targetHost}:${config.targetPort}. Is it running?`,
        details: err.message,
      });
      resolve();
    });

    // Forward request body for POST/PUT/PATCH
    if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
      const body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      proxyReq.write(body);
    }

    proxyReq.end();
  });
}

/**
 * Extract the target port from the __port query parameter.
 * Returns the port and a clean query string (without __port) to forward upstream.
 */
function extractPortAndQuery(request: FastifyRequest): { port: number | null; queryString: string } {
  const query = request.query as Record<string, string>;
  const portStr = query.__port;
  const port = portStr ? parseInt(portStr, 10) : null;

  // Rebuild query string without __port
  const url = new URL(request.url, "http://localhost");
  url.searchParams.delete("__port");
  const remaining = url.searchParams.toString();

  return {
    port: port && port > 0 && port <= 65535 ? port : null,
    queryString: remaining ? `?${remaining}` : "",
  };
}

export function registerPreviewProxy(app: FastifyInstance) {
  // Proxy route: /api/preview/:workspaceId/*
  app.all(
    "/api/preview/:workspaceId/*",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const wildcardPath =
        (request.params as Record<string, string>)["*"] || "";
      const { port, queryString } = extractPortAndQuery(request);

      if (!port) {
        return reply.code(400).send({
          error: "No target port specified",
          message: "Enter a URL with a port (e.g. http://localhost:3000) to preview.",
        });
      }

      await proxyRequest(request, reply, {
        targetHost: "localhost",
        targetPort: port,
      }, "/" + wildcardPath + queryString);
    }
  );

  // Also handle the root path without wildcard
  app.all(
    "/api/preview/:workspaceId",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { port, queryString } = extractPortAndQuery(request);

      if (!port) {
        return reply.code(400).send({
          error: "No target port specified",
          message: "Enter a URL with a port (e.g. http://localhost:3000) to preview.",
        });
      }

      await proxyRequest(request, reply, {
        targetHost: "localhost",
        targetPort: port,
      }, "/" + queryString);
    }
  );
}
