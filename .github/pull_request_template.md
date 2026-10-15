Describe the user-visible behavior and the relevant approved design or architecture decision.

- Verification: commands run on this revision and the resulting CI run.
- Failure handling: retries, recovery, authorization and financial invariants affected.
- UI evidence: desktop, mobile, keyboard and reduced-motion checks where relevant.
- Documentation: governing docs and status updated with facts and remaining limits.
- Release impact: migrations, compatibility, rollback and operational prerequisites.

Before merging, every mandatory job must pass through **Quality gate** on the current PR revision. Local hooks support this rule; GitHub branch protection must require the check separately. Never substitute prototype screenshots, mocked wallets or previous runs for evidence of live settlement or production readiness.
