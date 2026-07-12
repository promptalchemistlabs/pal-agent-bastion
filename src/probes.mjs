import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function createHttpHealthProbe({ url, fetchImpl = fetch, timeoutMs = 1500 }) {
  return async () => {
    const started = performance.now();
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      const body = await response.json().catch(() => ({}));
      const healthy = response.ok && ["ok", "healthy"].includes(body.status);
      return {
        status: healthy ? "healthy" : "unhealthy",
        summary: healthy ? `${url} responded successfully.` : `${url} returned an unhealthy response.`,
        latencyMs: Math.round(performance.now() - started),
        evidence: { httpStatus: response.status, reportedStatus: body.status ?? "missing" },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        summary: `${url} could not be reached.`,
        latencyMs: Math.round(performance.now() - started),
        evidence: { errorType: error.name },
      };
    }
  };
}

export function createTursoProbe({ env = process.env, databasePing = null } = {}) {
  return async () => {
    const configured = Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
    if (!configured) {
      return {
        status: "unhealthy",
        summary: "Turso root environment configuration is incomplete.",
        evidence: { databaseUrlConfigured: Boolean(env.TURSO_DATABASE_URL), authTokenConfigured: Boolean(env.TURSO_AUTH_TOKEN) },
      };
    }
    if (!databasePing) {
      return {
        status: "unknown",
        summary: "Turso is configured, but no connectivity adapter was supplied.",
        evidence: { databaseUrlConfigured: true, authTokenConfigured: true },
      };
    }
    const started = performance.now();
    try {
      await databasePing({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
      return {
        status: "healthy",
        summary: "Turso accepted a read-only connectivity probe.",
        latencyMs: Math.round(performance.now() - started),
        evidence: { databaseUrlConfigured: true, authTokenConfigured: true },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        summary: "Turso rejected or did not answer the read-only connectivity probe.",
        latencyMs: Math.round(performance.now() - started),
        evidence: { databaseUrlConfigured: true, authTokenConfigured: true, errorType: error.name },
      };
    }
  };
}

export function createTelegramConfigurationProbe({ env = process.env } = {}) {
  return async () => {
    const configured = Boolean(env.TELEGRAM_BOT_TOKEN);
    return {
      status: configured ? "healthy" : "degraded",
      summary: configured ? "Telegram bot configuration is present." : "Telegram bot token is absent; API/mock mode remains available.",
      evidence: { botTokenConfigured: configured },
    };
  };
}

export function createGatsbySurfaceProbe({ root = path.join(REPO_ROOT, "tembusu-circle") } = {}) {
  return async () => {
    const packageFile = path.join(root, "package.json");
    const publicIndex = path.join(root, "public", "index.html");
    const contentRoot = path.join(root, "content");
    const [hasPackage, hasBuild, hasContent] = await Promise.all([exists(packageFile), exists(publicIndex), exists(contentRoot)]);
    let markdownFiles = 0;
    if (hasContent) {
      const walk = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const target = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(target);
          else if (/\.mdx?$/.test(entry.name)) markdownFiles += 1;
        }
      };
      await walk(contentRoot);
    }
    let buildAgeSeconds = null;
    if (hasBuild) buildAgeSeconds = Math.max(0, Math.round((Date.now() - (await stat(publicIndex)).mtimeMs) / 1000));
    const healthy = hasPackage && hasBuild && hasContent && markdownFiles > 0;
    return {
      status: healthy ? "healthy" : "degraded",
      summary: healthy ? "Tembusu Circle Gatsby content and build surfaces are present." : "The Tembusu Circle Gatsby content or build surface is incomplete.",
      evidence: { packagePresent: hasPackage, buildPresent: hasBuild, contentPresent: hasContent, markdownFiles, buildAgeSeconds },
    };
  };
}

export function createDefaultProbes({ env = process.env, fetchImpl = fetch, databasePing = null, repoRoot = REPO_ROOT } = {}) {
  const endpoints = {
    orin: env.ORIN_HEALTH_URL ?? `http://127.0.0.1:${env.ORIN_PORT ?? 4101}/health`,
    scribe: env.SCRIBE_HEALTH_URL ?? `http://127.0.0.1:${env.SCRIBE_PORT ?? 4102}/health`,
    rick: env.RICK_HEALTH_URL ?? `http://127.0.0.1:${env.RICK_PORT ?? 4103}/health`,
    kingdom: env.KINGDOM_HEALTH_URL ?? `http://127.0.0.1:${env.KINGDOM_PORT ?? 4000}/health`,
  };
  return [
    ...Object.entries(endpoints).map(([id, url]) => ({
      id: id === "kingdom" ? "kingdom-api" : id,
      target: id === "kingdom" ? "Kingdom API" : id[0].toUpperCase() + id.slice(1),
      category: id === "kingdom" ? "service" : "agent",
      run: createHttpHealthProbe({ url, fetchImpl }),
    })),
    { id: "turso", target: "Turso", category: "database", run: createTursoProbe({ env, databasePing }) },
    { id: "telegram", target: "Telegram", category: "integration", run: createTelegramConfigurationProbe({ env }) },
    { id: "tembusu-circle", target: "Tembusu Circle Gatsby", category: "content", run: createGatsbySurfaceProbe({ root: path.join(repoRoot, "tembusu-circle") }) },
  ];
}
