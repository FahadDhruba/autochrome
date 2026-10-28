# Workflow: plan with Opus, execute with Sonnet

- Model is `opusplan`: plan mode runs on Opus, everything else runs on Sonnet.
- For non-trivial work, start in plan mode (Shift+Tab) so Opus produces the plan; approving it switches to Sonnet for execution.
- Small, obvious edits: skip planning and just do them.
- Subagents default to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL`). The `executor` agent is for handing off a finished plan.

# Commits

- Commit as `fahaddhruba <dhruba.fahad2004@gmail.com>`. No Claude co-author or session trailers in commits or PRs.
