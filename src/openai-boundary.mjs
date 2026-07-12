/**
 * Advisory-only boundary matching the OpenAI Agents SDK `run(agent, input)` shape.
 * Deterministic probe results remain authoritative; the model may only improve
 * wording and recommendations and receives no credentials or private content.
 */
export function createOpenAIAgentsSdkBoundary({ runner, agent }) {
  if (typeof runner !== "function") throw new TypeError("runner must be a function");
  return {
    mode: "openai-agents-sdk",
    async advise(diagnostic) {
      const safeDiagnostic = {
        overallStatus: diagnostic.overallStatus,
        summary: diagnostic.summary,
        checks: diagnostic.checks.map(({ id, target, category, status, summary }) => ({ id, target, category, status, summary })),
      };
      const response = await runner(agent, JSON.stringify({ instruction: "Recommend read-only recovery steps only.", diagnostic: safeDiagnostic }));
      const output = response?.finalOutput ?? response;
      return {
        summary: String(output?.summary ?? diagnostic.summary),
        recommendations: Array.isArray(output?.recommendations) ? output.recommendations.map(String) : [],
      };
    },
  };
}
