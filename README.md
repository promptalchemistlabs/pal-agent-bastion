# Bastion

> Agent, infrastructure and memory diagnosis for Kingdom of PAL.

Bastion checks operational health, diagnoses failed workflows and integrations,
and recommends recovery actions without silently modifying production systems.

## Status

The `0.2.0` runtime implements deterministic, read-only health and diagnostic
checks for the three peer agents, Kingdom API, Turso, Telegram, and the Tembusu
Circle Gatsby content/build surface. Model advice is optional and never replaces
probe evidence.

## Core responsibilities

- Check agent and service health
- Diagnose failed workflows, integrations and dependencies
- Monitor memory reads, writes, indexes and freshness
- Identify configuration and operational problems
- Recommend recovery actions and report operational risk

## Boundaries

Bastion cannot modify production or memory records without approval, perform
destructive recovery automatically, expose credentials, or expand its own
permissions.

See [`agent.yaml`](agent.yaml) for the machine-readable contract and
[`docs/ROLE.md`](docs/ROLE.md) for detailed operating rules.

## Kingdom integration

- Registry: `promptalchemistlabs/sleeping-prince/agent-registry.yaml`
- Contracts: `promptalchemistlabs/sleeping-prince/shared-contracts/`
- Workflow: `operational-diagnosis`

## HTTP interface

- `GET /health` reports Bastion's own process health.
- `GET /capabilities` lists diagnostic targets and the non-mutation boundary.
- `GET|POST /diagnostics` runs the configured read-only probes.
- `POST /tasks` accepts the shared `v1alpha1` task request and returns a shared
  task result with the report at `outputs.diagnostic`.

The dashboard contract is:

```text
diagnosticId, generatedAt, overallStatus, summary, checks[], counts
```

Each check contains a target, category, status, safe evidence,
recommendations, and an `escalateToRick` flag. Credentials are reduced to
presence booleans and are never included in reports.

## Development

Run from this directory:

```bash
npm test
npm start
```

`npm start` reads only the kingdom root `.env` through
`--env-file-if-exists=../../.env`. Supported overrides include `BASTION_PORT`,
agent health URLs/ports, `KINGDOM_HEALTH_URL`, Turso credentials, and
`TELEGRAM_BOT_TOKEN`.

Probe functions are dependency-injected for deterministic tests. The production
server supplies a read-only `SELECT 1` Turso connectivity adapter. Bastion never
restarts services, changes configuration, publishes content, or mutates the
database.

## Licence

No licence has been selected yet.
