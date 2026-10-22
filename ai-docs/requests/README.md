# Requests

One file per creation: `ai-docs/requests/<name>.md`. The builder agent
for that creation writes (and owns) only its own file here. The engine
owner scans this folder for needs that require engine or hub changes.

## Format

```md
# Requests: <creation name>

## Engine gaps
Capabilities the engine does not have that this creation needs.
- <what you need, why, where it hurts>

## Hub integration
- [ ] hub card: <Label> -> <page>.html

## Shared helpers
- <what you put in src/lib/ that other creations may want, or a lib
  helper you need that doesn't exist>

## Collisions / notes
- <anything shared you had to work around, weird interactions, etc.>
```

Append-only within your own file. Do not edit other creations' request
files. An empty file means "nothing needed" - still create it so the
owner knows the slot was claimed.
