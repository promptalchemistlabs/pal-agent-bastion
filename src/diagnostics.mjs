const STATUSES = new Set(["healthy", "degraded", "unhealthy", "unknown"]);

const DEFAULT_RECOMMENDATIONS = {
  unhealthy: "Inspect the target's configuration and logs, then rerun the read-only diagnostic.",
  degraded: "Review the reported evidence before relying on this capability.",
  unknown: "Supply or enable the relevant read-only probe to establish health.",
};

function normalizeCheck(probe, result) {
  const status = STATUSES.has(result?.status) ? result.status : "unknown";
  const securityRelated = Boolean(result?.securityRelated);
  return {
    id: probe.id,
    target: probe.target,
    category: probe.category,
    status,
    summary: String(result?.summary ?? "The probe returned no diagnostic summary."),
    ...(Number.isFinite(result?.latencyMs) ? { latencyMs: result.latencyMs } : {}),
    ...(result?.evidence ? { evidence: result.evidence } : {}),
    recommendations: result?.recommendations?.length
      ? result.recommendations.map(String)
      : status === "healthy" ? [] : [DEFAULT_RECOMMENDATIONS[status]],
    escalateToRick: securityRelated,
  };
}

function overallStatus(counts) {
  if (counts.unhealthy > 0) return "unhealthy";
  if (counts.degraded > 0 || counts.unknown > 0) return "degraded";
  return "healthy";
}

export async function runDiagnostics({ probes, id = crypto.randomUUID, now = () => new Date().toISOString() }) {
  const checks = await Promise.all(probes.map(async (probe) => {
    try {
      return normalizeCheck(probe, await probe.run());
    } catch (error) {
      return normalizeCheck(probe, {
        status: "unknown",
        summary: `${probe.target} probe failed without changing the target.`,
        evidence: { errorType: error.name },
      });
    }
  }));
  const counts = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
  for (const check of checks) counts[check.status] += 1;
  const status = overallStatus(counts);
  return {
    diagnosticId: `diagnostic-${id()}`,
    generatedAt: now(),
    overallStatus: status,
    summary: status === "healthy"
      ? `All ${checks.length} diagnostic checks are healthy.`
      : `${counts.unhealthy} unhealthy, ${counts.degraded} degraded, and ${counts.unknown} unknown checks require attention.`,
    checks,
    counts,
  };
}
