import http from "node:http";
import { createClient } from "@libsql/client";
import { createBastion } from "./bastion.mjs";
import { createDefaultProbes } from "./probes.mjs";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createBastionServer({ bastion = createBastion() } = {}) {
  return http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    try {
      if (request.method === "GET" && request.url === "/health") return response.end(JSON.stringify(bastion.health()));
      if (request.method === "GET" && request.url === "/capabilities") return response.end(JSON.stringify(bastion.capabilities()));
      if (request.method === "GET" && request.url === "/diagnostics") return response.end(JSON.stringify(await bastion.diagnose()));
      if (request.method === "POST" && request.url === "/diagnostics") return response.end(JSON.stringify(await bastion.diagnose(await readJson(request))));
      if (request.method === "POST" && request.url === "/tasks") {
        const result = await bastion.handleTask(await readJson(request));
        response.statusCode = result.status === "failed" ? 400 : 200;
        return response.end(JSON.stringify(result));
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const databasePing = async ({ url, authToken }) => {
    const client = createClient({ url, authToken });
    try { await client.execute("SELECT 1"); } finally { client.close(); }
  };
  const bastion = createBastion({ probes: createDefaultProbes({ databasePing }) });
  const port = Number(process.env.BASTION_PORT ?? 4104);
  createBastionServer({ bastion }).listen(port, () => console.log(`Bastion listening on http://127.0.0.1:${port}`));
}
