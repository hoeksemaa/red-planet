---
name: context-map
description: Shows what's loaded in the current context window. Lists every file injected into this session (CLAUDE.md hierarchy, memory, skills, IDE context) with line counts and file paths. Use when the user says "context map", "what's in context", "show context", or "context inventory".
---

# Context Map

Report what's in your context right now. No research, no exploration —
just enumerate what you can already see.

## Procedure

1. **Scan your system-reminder tags and conversation preamble.** Identify
   every file path mentioned as loaded content — CLAUDE.md files, memory
   files, skill lists, IDE open files, git status.

2. **Run `wc -l` on each file** to get line counts. One Bash call, all
   files in parallel:
   ```
   wc -l file1 file2 file3 ...
   ```

3. **Present the table.** Use this exact format:

```
Context Map
───────────────────────────────────────────────
Layer                          File                              Lines
─────                          ────                              ─────
System prompt                  (built-in, not inspectable)         —
CLAUDE.md (global)             ~/.claude/CLAUDE.md                 26
CLAUDE.md (workspace)          ~/Documents/GitHub/CLAUDE.md        67
CLAUDE.md (project)            ./CLAUDE.md                        144
Memory                         (project memory)/MEMORY.md          11
Skills registered              13 skills (metadata only)            —
IDE open file                  ./src/whatever.ts                   42
Git status                     (auto-loaded snapshot)               —
Conversation                   this session                         —
───────────────────────────────────────────────
Static context (files)         ~XXX lines
```

4. **Shorten paths** for readability — use `~` for home, `./` for
   project root. Keep full paths available as markdown links so they're
   clickable in VS Code.

5. **Don't estimate tokens.** Line count is the metric. Don't
   editorialize about context health or suggest optimizations unless
   asked.

## Rules

- Only report what you can actually see in this session's context.
- If a file path appears in a system-reminder but you're unsure whether
  it's fully loaded vs. referenced, note it.
- Skills: list the count and note "metadata only" — full SKILL.md
  content loads only when invoked. If a skill IS currently invoked
  (like this one), note that.
- Be fast. This is a glance, not an audit.
