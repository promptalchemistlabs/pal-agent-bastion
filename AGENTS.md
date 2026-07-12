# Contributor instructions

This repository owns Bastion only. Kingdom-wide contracts, policies and workflows
belong in `promptalchemistlabs/sleeping-prince`.

- Treat `agent.yaml` and `docs/ROLE.md` as the local sources of truth.
- Do not broaden capabilities or permissions without a registry and policy review.
- Preserve compatibility with the declared `v1alpha1` contracts.
- Keep operational diagnosis separate from Rick's security and permission decisions.
- Prefer health metadata over private business content during diagnosis.
- Add tests for every diagnostic behaviour and contract change.
- Never commit credentials, private community data, runtime memory or production logs.
- Mark unimplemented behaviour explicitly; do not present roadmap features as ready.
- Update the manifest version when behaviour or interfaces change.
