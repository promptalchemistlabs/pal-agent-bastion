import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createBastion } from "../src/bastion.mjs";
import { createOpenAIAgentsSdkBoundary } from "../src/openai-boundary.mjs";
import { createDefaultProbes, createGatsbySurfaceProbe, createTelegramConfigurationProbe, createTursoProbe } from "../src/probes.mjs";
import { createBastionServer } from "../src/server.mjs";

const NOW = "2026-07-12T12:00:00.000Z";
const task = {
  contractVersion: "v1alpha1",
  taskId: "task-1",
  workflowId: "workflow-1",
  parentTaskId: "orin-task-1",
  sender: "orin",
  recipient: "bastion",
  objective: "Diagnose why the website build failed",
  inputs: {},
  contextReferences: [],
  risk: "low",
  approvalId: null,
  requestedAt: NOW,
};

const fixedProbes = () => [
  { id: "orin", target: "Orin", category: "agent", run: async () => ({ status: "healthy", summary: "Orin is available.", latencyMs: 8 }) },
  { id: "gatsby", target: "Tembusu Circle Gatsby", category: "content", run: async () => ({ status: "unhealthy", summary: "Build is missing.", evidence: { buildPresent: false } }) },
  { id: "security", target: "Operational logs", category: "service", run: async () => ({ status: "degraded", summary: "Possible credential exposure.", securityRelated: true, recommendations: ["Route the finding to Rick."] }) },
];

test("produces the dashboard diagnostic shape without mutating targets", async () => {
  let sequence = 0;
  const bastion = createBastion({ probes: fixedProbes(), id: () => `fixed-${++sequence}`, now: () => NOW });
  const diagnostic = await bastion.diagnose();

  assert.equal(diagnostic.diagnosticId, "diagnostic-fixed-1");
  assert.equal(diagnostic.overallStatus, "unhealthy");
  assert.deepEqual(diagnostic.counts, { healthy: 1, degraded: 1, unhealthy: 1, unknown: 0 });
  assert.equal(diagnostic.checks[1].evidence.buildPresent, false);
  assert.equal(diagnostic.checks[2].escalateToRick, true);
  assert.deepEqual(diagnostic.checks[2].recommendations, ["Route the finding to Rick."]);
});

test("wraps diagnostics in the unchanged v1alpha1 task result", async () => {
  const bastion = createBastion({ probes: fixedProbes(), id: () => "fixed", now: () => NOW });
  const result = await bastion.handleTask(task);

  assert.equal(result.contractVersion, "v1alpha1");
  assert.equal(result.agentId, "bastion");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.diagnostic.overallStatus, "unhealthy");
});

test("rejects invalid and misaddressed tasks", async () => {
  const bastion = createBastion({ probes: [], now: () => NOW });
  const invalid = await bastion.handleTask({ ...task, contractVersion: "v2" });
  const misaddressed = await bastion.handleTask({ ...task, recipient: "rick" });
  assert.equal(invalid.status, "failed");
  assert.match(invalid.error, /v1alpha1/);
  assert.match(misaddressed.error, /addressed to bastion/);
});

test("Turso probe is deterministic, redacts credentials, and supports injected connectivity", async () => {
  let received;
  const probe = createTursoProbe({
    env: { TURSO_DATABASE_URL: "libsql://example", TURSO_AUTH_TOKEN: "secret" },
    databasePing: async (config) => { received = config; },
  });
  const result = await probe();
  assert.equal(result.status, "healthy");
  assert.deepEqual(received, { url: "libsql://example", authToken: "secret" });
  assert.equal(JSON.stringify(result).includes("secret"), false);

  const missing = await createTursoProbe({ env: {} })();
  assert.equal(missing.status, "unhealthy");
});

test("Telegram configuration probe supports token and mock-mode states", async () => {
  assert.equal((await createTelegramConfigurationProbe({ env: { TELEGRAM_BOT_TOKEN: "secret" } })()).status, "healthy");
  const mock = await createTelegramConfigurationProbe({ env: {} })();
  assert.equal(mock.status, "degraded");
  assert.match(mock.summary, /mock mode/i);
});

test("default probe registry covers every required operational surface", () => {
  const ids = createDefaultProbes({ env: {}, fetchImpl: async () => { throw new Error("not called"); } }).map(({ id }) => id);
  assert.deepEqual(ids, ["orin", "scribe", "rick", "kingdom-api", "turso", "telegram", "tembusu-circle"]);
});

test("Gatsby probe diagnoses Markdown content and build artifacts read-only", async () => {
  const healthy = await createGatsbySurfaceProbe()();
  assert.equal(healthy.status, "healthy");
  assert.ok(healthy.evidence.markdownFiles > 0);
  assert.equal(healthy.evidence.buildPresent, true);

  const missing = await createGatsbySurfaceProbe({ root: "/tmp/does-not-exist-bastion" })();
  assert.equal(missing.status, "degraded");
});

test("OpenAI Agents SDK boundary remains advisory and receives only safe metadata", async () => {
  let input;
  const boundary = createOpenAIAgentsSdkBoundary({
    agent: { name: "Bastion" },
    runner: async (_agent, value) => {
      input = JSON.parse(value);
      return { finalOutput: { summary: "Review the failed build.", recommendations: ["Inspect Gatsby build logs."] } };
    },
  });
  const bastion = createBastion({ probes: fixedProbes(), advisoryBoundary: boundary, id: () => "fixed", now: () => NOW });
  const diagnostic = await bastion.diagnose();
  assert.equal(diagnostic.advisory.recommendations[0], "Inspect Gatsby build logs.");
  assert.deepEqual(Object.keys(input.diagnostic.checks[0]), ["id", "target", "category", "status", "summary"]);
});

test("HTTP server exposes health, capabilities, diagnostics, and tasks", async () => {
  const bastion = createBastion({ probes: fixedProbes(), id: () => "fixed", now: () => NOW });
  const server = createBastionServer({ bastion });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${origin}/health`).then((response) => response.json());
  assert.equal(health.agentId, "bastion");
  const capabilities = await fetch(`${origin}/capabilities`).then((response) => response.json());
  assert.equal(capabilities.mutatesInfrastructure, false);
  const diagnostics = await fetch(`${origin}/diagnostics`).then((response) => response.json());
  assert.equal(diagnostics.overallStatus, "unhealthy");
  const postedDiagnostics = await fetch(`${origin}/diagnostics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((response) => response.json());
  assert.equal(postedDiagnostics.checks.length, 3);
  const result = await fetch(`${origin}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(task),
  }).then((response) => response.json());
  assert.equal(result.outputs.diagnostic.counts.unhealthy, 1);
});
