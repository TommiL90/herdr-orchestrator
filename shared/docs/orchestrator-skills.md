<!-- Ported from tomidev-shell@6ae777532 assets/orchestrator-skills.md; adapted for the hcorc/herdorc orchestrators, any coding CLI. Adaptations: shared/PROVENANCE-docs.md -->

# Orchestrator — Skills Detail (lazy-loaded)

Bind this to the parent orchestrator session only, on skill resolution/discovery. Not always-on; loaded on demand from the always-on core's `## Skill Registry Protocol` and `## Intent-Driven Skill Discovery` pointers.

## Skill Registry Protocol

The effective view is the session's available-skills listing (`<available_skills>` where the CLI renders it, or whatever skill list the CLI gives its agent) plus the on-disk rows the orchestrator resolves itself: on each primary-session agent start, it lists the `SKILL.md` files found in project and other agents' skill directories that the session did not load (every skill when the session renders no available-skills listing); there are no on-disk rows when there are none. An on-disk row whose name is also in the available-skills listing won precedence (a project copy outranks a user or package copy); use the on-disk row. In the available-skills listing the `Trigger / description` is the skill's description (`<description>`) and the `Path` is its location (`<location>`); when the listing shows no path, resolve the exact `SKILL.md` path on disk. Use this view to select skills and delegate:

1. Match task context and target files against the effective view's `Trigger / description` column.
2. Pass only matching exact `Path` values to subagents under `## Skills to load before work`. Match the delegated task's own files and actions, never a fixed set: a child that will not commit gets no commit skill, and one that writes no docs gets no docs skill.
3. Tell subagents to read those exact `SKILL.md` files before reading, writing, reviewing, testing, or creating artifacts.
4. If no skill matches, continue without project skill injection and report `skill_resolution: none`.

The shared `.atl/skill-registry.md` indexes disk only and is never the full effective view. The view is unavailable only when neither the available-skills listing nor the orchestrator's on-disk resolution is available: then say so; a disk-only fallback may omit runtime-only skills. Disk changes appear in the view at the next agent start, not mid-run.

Subagents should receive exact indexed paths. They should not have to rediscover the registry.

Subagents do not independently discover additional project/user `SKILL.md` files or the registry during normal runtime. The parent passes selected project/user skill paths explicitly.

If a subagent reports `skill_resolution`, interpret it as project/user skill resolution:

- `paths-injected`: parent supplied `## Skills to load before work` with exact `SKILL.md` paths.
- `fallback-registry`: subagent self-loaded skill paths from the registry because parent paths were missing; degraded but auditable.
- `fallback-path`: subagent loaded explicit skill paths because parent paths were missing; degraded but auditable.
- `none`: no project/user skills were loaded.

If any subagent reports a fallback instead of `paths-injected`, treat it as an orchestration gap and correct future delegations by passing exact indexed paths directly.

## Intent-Driven Skill Discovery

For skill-shaped requests, do not treat the session's available-skills listing as complete. Use the registry and filesystem only as a discovery aid; do not let a trigger table override the user's concrete request or turn a small request into a larger workflow.

Discovery order:

1. Consult the available-skills listing and the orchestrator's on-disk rows, when present, before acting or delegating.
2. Read the matching exact `SKILL.md` path when acting; pass it to the subagent when delegating.
3. If the view is unavailable, disclose the limitation; `.atl/skill-registry.md` is a disk-only fallback, not a complete session view.
4. If an expected workflow is absent, search configured skill roots only as a fallback. Prefer the most specific project skill over a global skill with the same intent.
5. If no matching skill exists, continue with the smallest safe fallback and say which expected skill was unavailable.

Common intent hints, not hard routing:

| User intent                | Skill to check                         |
| -------------------------- | -------------------------------------- |
| PR review / diff review    | `requesting-code-review`               |
| Post-ready review comments | `comment-writer`                       |
| Create/open/prepare PR     | `delivery`                             |
| Spec Lean feature delivery | `tlc-spec-lean`                        |
| Clean code & guard clauses | `clean-code`                           |
| Software testing rules     | `testing`                              |
| Consensus loop protocol    | `consensus`                            |
| Product / web UI design    | `gentle-ui-design`                     |
| Frontend / browser UI / QA | `ego-browser`                          |

For frontend tasks (web apps, UI components, layout, visual dogfooding, forms, and browser interaction), check and use `ego-browser` (Ego Lite). Use `ego-browser nodejs` to open pages, verify live rendering on local dev servers, inspect console errors, take screenshots, and test user interactions in a real Chromium browser rather than relying solely on headless unit tests or simulated DOM.

Keep this lightweight: loading a skill should improve the immediate task, not force extra ceremony.
