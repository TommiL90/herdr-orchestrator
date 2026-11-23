---
name: requesting-code-review
description: Review an in-scope diff for correctness, security, regressions, maintainability, and simplification. Findings grouped by Critical/Important/Minor with file:line, mechanism, impact, cause, and fix, refuted independently before any correction, accompanied by simplification tags and a clear readiness verdict.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.1"
---
<!-- Ported from tomidev-shell@6ae777532 skills/requesting-code-review/; adapted for the hcorc/herdorc orchestrators, any coding CLI (hcorc/herdorc). Adaptations: shared/PROVENANCE-skills.md -->

# Code Review Protocol

Own defects, regressions, security risks, maintainability issues, and unnecessary complexity in changed code.

## Review Responsibility and Scope

- Review the actual diff against the base/target branch (committed, staged, and working tree changes).
- Reviewers are strictly read-only: inspect, evaluate, and report. Never edit code, stage files, or run commits.
- Base review on approved requirements/plan/checks, changed files, and existing verification evidence.
- Do not repeat acceptance testing or run full test suites unless investigating a specific defect.

## Review subject

- State the reviewed range in the result: `base..head` for committed work, or the working tree against a named base. Every lens and the refuter receive that same range.
- Hand each reviewer the intent the change was built for (the request, plan, or checks). A behavior the request asked for is reported, if at all, as a design concern, never as a regression.

## Specialist Review Lenses

The orchestrator selects lenses by consequence, not by file names or counts. A change that touches one concern pays for one lens:

- **review-risk** when a mistake could expose, lose, or irreversibly change something: stored data, credentials, permissions, tenant boundaries, guards, or contracts others consume.
- **review-resilience** when it changes behavior under failure: errors, retries, timeouts, partial writes, load, or degradation paths.
- **review-readability** when it changes what others read or depend on: public APIs, messages, documentation, code structure, `clean-code` guard clauses and shallow control flow.
- **review-reliability** when it changes logic or observable behavior that tests should pin: error handling, resource lifecycle, async ordering, state synchronization.

Give one `Lenses reason:` line naming what was touched and how. Requirement compliance is the verifier's job; never pick a lens to re-check specs.

## Simplification Review

Examine in-scope code for opportunities to reduce unnecessary complexity using standard tags:
- `delete`: Dead code or obsolete configuration.
- `stdlib`: Custom code duplicating standard library capabilities.
- `native`: Unnecessary dependencies or wrappers where platform native features suffice.
- `reuse`: Duplication of existing repo utilities (must cite path).
- `yagni`: Premature generalizations and speculative abstractions.
- `shrink`: Clearer, more concise expressions of identical logic.

## Cause and evidence

Every Critical and Important finding declares:

- `Cause: introduced | pre-existing | unknown`. `introduced` means the reviewed range created or activated the defect; `pre-existing` means it already exists at the base and the change did not worsen it.
- `Evidence: deterministic | inferential`. `deterministic` cites a changed hunk, a failing command, or a before/after comparison; `inferential` is reasoning without such proof.

Only `introduced` Critical and Important findings count toward the verdict. `pre-existing` findings go under `### Follow-ups` and never block. An `unknown` cause is settled by the refuter.

## Refutation and correction

The orchestrator directed the change, so it never rejects a Critical or Important finding alone.

1. **Refute first.** Before any correction, send every Critical and Important finding in one batch to `review-refuter`, with the reviewed range and intent. It answers each with `corroborated | refuted | inconclusive` and proof.
2. **Act on the outcome.** `corroborated` is corrected; `refuted` is dropped, citing the refuter's proof; `inconclusive` becomes one **Needs your decision** naming the open findings. Minor findings and simplifications are adjudicated by the orchestrator with evidence.
3. **One bounded correction.** Fix all corroborated findings in one correction batch. As guidance, a correction larger than min(200, half the reviewed diff) changed lines is a redesign: stop and ask.
4. **Scoped recheck.** The lenses that raised them recheck once, limited to those findings and the correction diff, never a new full sweep. A finding still open after the recheck becomes one **Needs your decision**; a second correction runs only when the same finding is still failing.

## Unavailable reviewers

A lens that fails, times out, or cannot inspect the diff reports `not reviewed` with the reason. A `not reviewed` lens never counts as `Ready: Yes`, is never replaced by the orchestrator's own opinion, and is listed in the result.

## Output Format

Every review must output structured findings grouped by severity, followed by the simplification tags line and the readiness verdict:

```markdown
Reviewed: <base..head | working tree vs base>
Lenses reason: <what was touched and how>

### Critical
- `path/to/file.ext:42`: [Mechanism] Unhandled null dereference in payment callback. [Impact] Process crashes on missing optional receipt. [Cause: introduced] [Evidence: deterministic] [Fix] Add guard clause `if (!receipt) return fallbackReceipt;`.

### Important
- `path/to/file.ext:105`: [Mechanism] Missing tenant scope in cache key. [Impact] Cross-tenant cache pollution on multi-tenant reads. [Cause: introduced] [Evidence: inferential] [Fix] Prefix key with `tenantId`.

### Minor
- `path/to/file.ext:15`: [Mechanism] Redundant type assertion. [Impact] Bypasses compiler type narrowing. [Fix] Use TypeScript type guard.

### Follow-ups
- `path/to/other.ext:8`: [Mechanism] Unbounded retry loop. [Cause: pre-existing] Not changed by this range.

### Simplifications
- `path/to/file.ext:60` — `stdlib`: Custom debounce helper duplicates runtime timer utility → replace with native runtime helper; non-blocking.

Tags: [none | delete | stdlib | native | reuse | yagni | shrink]
Ready: Yes | Ready: With fixes | Ready: No
```

- **Ready: Yes**: No introduced Critical or Important findings, and no selected lens is `not reviewed`. Minor findings, follow-ups, or non-blocking simplifications may exist.
- **Ready: With fixes**: Introduced Important findings present that should be addressed before landing, but architectural approach is sound.
- **Ready: No**: Introduced Critical defects, security vulnerabilities, or fundamental architectural flaws.
