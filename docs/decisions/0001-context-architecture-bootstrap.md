# 0001 — Context architecture bootstrap v10.1

Date: 2026-11-05
Status: Accepted
Decision: Use one canonical `AGENTS.md`, per-module `AGENTS.md` and `DATA.md`, need-to-know docs under `docs/`, and task levels L0–L2.
Context: Agent sessions must stay cheap in tokens, resume without re-explaining, and change one module without reading the rest.
Rationale: `AGENTS.md` is read natively by current coding agents; nested files give path-specific context without tool lock-in. Atomic decisions, lazy docs, and task levels keep loaded context small.
Consequences: No tool-specific router files. Product, architecture, and security docs change only with user confirmation. Code is organised as a modular monolith. Docs are created only when they have real content.
Alternatives_Rejected: Per-tool rule files (drift, lock-in). One long instruction file (token cost, diluted attention). Real microservices (operational cost disproportionate for the goal).
