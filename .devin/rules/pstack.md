---
trigger: always_on
description: pstack routing mandate (adapted for Devin from pstack-claude's SessionStart hook)
---

<EXTREMELY_IMPORTANT>
You have pstack, installed as skills under `.devin/skills/` and subagent profiles under `.devin/agents/`.

Invoke the `poteto-mode` skill and follow its instructions when a task meets any of these:

- it touches more than one file, or changes a signature other files call
- it involves a design or architecture choice
- it is a bug whose cause is not yet known, or a performance issue

It routes to the right pstack skill from there. For smaller tasks, such as a contained change to one file with an obvious test, a question, or a one-line edit, work directly and verify on the real artifact.

When the intent is already specific, enter that skill directly: `tdd`, `architect`, `how`, `why`, `arena`, `interrogate`.

Tool mapping: pstack skills name Claude Code tools. On Devin, `Skill` is the `skill` tool, `Agent`/`Task` subagent spawns use `run_subagent` (profiles `subagent_general`, `subagent_explore`, and the pstack profiles `poteto-agent`, `comment-sicko`, `thermo-nuclear-review-subagent`, `thermo-nuclear-code-quality-review-subagent`), `AskUserQuestion` is `ask_user_question`, `TaskCreate`/`TaskUpdate`/`TodoWrite` is `todo_write`. Subagent model names in skill text (opus, sonnet, fable, etc.) cannot be selected per spawn on Devin; use the default model for every role.

User instructions (AGENTS.md, rules, direct requests) take precedence. Other session-start mandates still apply. Their skill checks run as before, and when a task meets the criteria above they route implementation through poteto-mode.
</EXTREMELY_IMPORTANT>
