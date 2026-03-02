# Tova Project Governance

This document describes how the Tova project is governed — who makes decisions, how decisions are made, and how you can gain more responsibility within the project.

## Overview

Tova uses a **Benevolent Dictator For Life (BDFL)** governance model. This means the project founder has final decision-making authority on all matters, while actively seeking and incorporating community input.

As the project matures toward and beyond 1.0, governance will include a core team and formal decision processes.

## Roles

### BDFL — Project Founder

**Enoch Kujem Abassey** (@enoch)

The BDFL is responsible for:
- Setting the overall vision and direction of the language
- Making final decisions on RFCs, language design, and breaking changes
- Appointing and removing maintainers
- Resolving disputes that cannot be settled by consensus
- Representing the project publicly

The BDFL exercises authority sparingly. Most decisions are delegated to maintainers and resolved through consensus. The BDFL intervenes when:
- The community cannot reach consensus on a significant decision
- A decision has long-term implications for the language's design integrity
- Urgent action is needed (e.g., security vulnerabilities, code of conduct violations)

### Maintainers

Maintainers are trusted contributors with write access to the repository. They are responsible for:

- Reviewing and merging pull requests
- Triaging issues and managing the issue tracker
- Enforcing the code of conduct
- Mentoring new contributors
- Making day-to-day technical decisions within their area of expertise

**Becoming a Maintainer:**

Maintainer status is earned through sustained, high-quality contributions. There is no fixed threshold — it's a judgment call by existing maintainers and the BDFL based on:

- Consistent contributions over time (not just volume, but quality)
- Demonstrated understanding of the project's architecture and design philosophy
- Good judgment in code reviews and technical discussions
- Track record of constructive collaboration
- Willingness to do unglamorous work (triage, documentation, test coverage)

Maintainers are invited by the BDFL after discussion with existing maintainers. If you're interested in becoming a maintainer, the best path is to start contributing regularly and demonstrating the qualities above.

**Maintainer Areas:**

As the team grows, maintainers may specialize in areas:

| Area | Scope |
|------|-------|
| Compiler Core | Lexer, parser, analyzer, codegen |
| Runtime & Stdlib | Standard library, reactivity system |
| Tooling | CLI, LSP, VS Code extension, REPL |
| Edge & Server | Server codegen, edge targets, security |
| Browser & UI | Browser codegen, JSX, forms, scoped CSS |
| Performance | Benchmarks, optimizations, WASM |
| Documentation | Docs site, guides, API reference |
| Infrastructure | CI/CD, releases, packaging |

### Contributors

Anyone who contributes to the project — code, documentation, bug reports, code review, community support — is a contributor. Contributors don't need special permissions; they participate through issues and pull requests.

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Decision Making

### Everyday Decisions

Most decisions don't need formal process. Maintainers make judgment calls daily:
- Whether to merge a PR
- How to fix a bug
- Whether a test is sufficient
- Code style and naming choices

These decisions should be consistent with existing patterns and project values. If another maintainer disagrees, they discuss it on the PR or issue. Consensus is the goal.

### Technical Decisions

For decisions that affect the project's architecture or user-facing behavior:

1. **Discussion.** Open an issue or start a thread. Describe the problem, proposed solution, and trade-offs.
2. **Feedback period.** Allow reasonable time for input (proportional to the impact of the decision).
3. **Consensus.** If maintainers agree, proceed.
4. **Escalation.** If consensus cannot be reached, the BDFL makes the final call.

### Language Design Decisions

Changes to the language itself (new syntax, semantic changes, new keywords) follow the [RFC Process](CONTRIBUTING.md#rfc-process):

1. RFC submitted as a GitHub issue
2. Community discussion (minimum 2 weeks for significant changes)
3. Maintainer review and feedback
4. BDFL final decision

The bar for language changes is intentionally high. Every feature added is a feature that must be maintained forever. We prefer:
- Fewer, more powerful features over many specialized ones
- Consistency with existing syntax patterns
- Clear, unsurprising behavior
- Features that compose well with other features

### Breaking Changes

Before 1.0, breaking changes are permitted but should be:
- Clearly communicated in release notes
- Accompanied by migration guidance
- Batched when possible to reduce churn

After 1.0, breaking changes require:
- An RFC with strong justification
- A deprecation period (minimum one minor release)
- Automated migration tooling when feasible
- BDFL approval

## Values

These values guide decision-making at every level of the project:

### Correctness Over Convenience
Code that is correct but inconvenient is better than code that is convenient but subtly wrong. We don't add escape hatches that compromise safety unless the need is compelling.

### Simplicity Over Cleverness
The best code is code that's easy to understand. We prefer straightforward solutions over clever ones, even if the clever solution is marginally more efficient.

### Performance Is a Feature
Tova competes with Go and other compiled languages on performance benchmarks. We don't accept "it's JavaScript" as an excuse. Every optimization should be measured and its impact documented.

### Developer Experience Matters
Error messages should be helpful. Compilation should be fast. The tooling should just work. We invest in the experience of using Tova, not just the language itself.

### Small Core, Rich Ecosystem
The language core should be small and stable. Domain-specific functionality belongs in the standard library or in the block system (server, browser, edge, CLI, security, forms) — not in the core syntax.

## Conflict Resolution

### Technical Disputes

1. Discuss on the relevant issue or PR
2. If unresolved, involve additional maintainers
3. If still unresolved, the BDFL decides

The BDFL will explain the reasoning behind the decision. Disagreement is fine; the goal is that everyone understands *why* a decision was made, even if they'd have chosen differently.

### Interpersonal Conflicts

Follow the process outlined in the [Code of Conduct](CODE_OF_CONDUCT.md). The enforcement team handles these separately from technical decision-making.

### Removing Maintainers

Maintainer status can be revoked for:
- Sustained inactivity (after discussion and opportunity to re-engage)
- Repeated code of conduct violations
- Consistently poor judgment that harms the project

Removal is decided by the BDFL after consultation with other maintainers. The person in question will be given an opportunity to respond before any action is taken.

## Governance Evolution

This governance model is designed for the project's current stage (pre-1.0, small team). As Tova grows, we expect to evolve toward:

- **Post-1.0:** A core team with distributed decision-making authority, formal voting on RFCs, and a more structured process for breaking changes.

Any changes to governance will be proposed as an RFC, discussed publicly, and require BDFL approval.

## Contact

- **Project founder:** Enoch Kujem Abassey
- **GitHub:** https://github.com/tova-lang/tova-lang
- **Code of Conduct issues:** conduct@tova-lang.org

---

*This document was established in March 2026 and will be updated as the project evolves.*
