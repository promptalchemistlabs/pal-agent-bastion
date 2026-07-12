# Bastion

> Agent, infrastructure and memory diagnosis for Kingdom of PAL.

Bastion checks operational health, diagnoses failed workflows and integrations,
and recommends recovery actions without silently modifying production systems.

## Status

Contract scaffold only. The runtime is not implemented yet.

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

## Development

The language, framework and runtime entrypoint are deliberately undecided. Add
implementation code only after the kingdom contracts and runtime architecture
are approved.

## Licence

No licence has been selected yet.
