import { assertTaskRequest, taskResult } from "./contracts.mjs";
import { runDiagnostics } from "./diagnostics.mjs";
import { createDefaultProbes } from "./probes.mjs";

export function createBastion({
  probes = createDefaultProbes(),
  advisoryBoundary = null,
  id = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
} = {}) {
  return {
    id: "bastion",
    health() {
      return { status: "ok", agentId: "bastion", mode: advisoryBoundary ? "openai" : "deterministic", contractVersion: "v1alpha1" };
    },
    capabilities() {
      return {
        agentId: "bastion",
        capabilities: ["agent-health-diagnosis", "integration-diagnosis", "infrastructure-diagnosis", "memory-health-diagnosis"],
        targets: probes.map(({ id: probeId, target, category }) => ({ id: probeId, target, category })),
        mutatesInfrastructure: false,
      };
    },
    async diagnose() {
      const diagnostic = await runDiagnostics({ probes, id, now });
      if (advisoryBoundary) diagnostic.advisory = await advisoryBoundary.advise(diagnostic);
      return diagnostic;
    },
    async handleTask(input) {
      let task;
      try {
        task = assertTaskRequest(input);
        if (task.recipient !== "bastion") throw new TypeError("Bastion only accepts tasks addressed to bastion");
      } catch (error) {
        return taskResult({ taskId: input?.taskId ?? "invalid-task", status: "failed", summary: "Bastion rejected an invalid task request.", error: error.message, now });
      }
      const diagnostic = await this.diagnose();
      return taskResult({
        taskId: task.taskId,
        status: "completed",
        summary: diagnostic.summary,
        outputs: { diagnostic },
        now,
      });
    },
  };
}
