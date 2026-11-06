# Workflow: Opus does everything

- All work runs on Opus: planning, building, reviewing and testing. Do not hand work to Sonnet or to the `executor` subagent.
- For non-trivial work, write a short plan and get the user's approval before building.
- Small, obvious edits: skip planning and just do them.
- Before committing: lint, typecheck, unit tests, build and e2e must pass, and user-facing changes are checked in a real run with screenshots.

# Commits

- Commit as `fahaddhruba <dhruba.fahad2004@gmail.com>`. No Claude co-author or session trailers in commits or PRs.

# Continuity

- Read PLAN.md and CHECKLIST.md at the start of every session.
- Tick CHECKLIST.md items and add a session log row in the same PR as the work.
