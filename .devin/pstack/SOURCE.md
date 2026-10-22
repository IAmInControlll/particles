# pstack source

- Upstream: https://github.com/michael-denyer/pstack-claude (MIT)
- Port of: https://github.com/cursor/plugins/tree/main/pstack by Lauren Tan
- Installed commit: 903e7385382389806c59d6989b6274e24165082b

## Layout

- `.devin/skills/` - copy of `plugins/pstack/skills/` (65 skills)
- `.devin/agents/` - copy of `plugins/pstack/agents/` (4 subagent profiles)
- `.devin/rules/pstack.md` - routing mandate, adapted from `plugins/pstack/hooks/session-start-context.md`

## Devin adaptations

- `poteto-agent.md` fallback path points at `.devin/skills/` instead of the Claude plugin cache.
- No SessionStart hook; the always-on rule injects the same mandate.
- No per-role subagent model selection; role-model dispatch falls back to the session model. `setup-pstack` model config does not apply.

## Updating

```sh
git clone --depth 1 https://github.com/michael-denyer/pstack-claude "$TEMP/pstack-claude"
cp -r "$TEMP/pstack-claude/plugins/pstack/skills/." .devin/skills/
cp "$TEMP/pstack-claude/plugins/pstack/agents/"*.md .devin/agents/
```

Then reapply the `poteto-agent.md` path patch and record the new commit above.
