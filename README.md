# secondmind

[![npm version](https://img.shields.io/npm/v/@shiv_2608/secondmind.svg)](https://www.npmjs.com/package/@shiv_2608/secondmind)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen.svg)](https://github.com/shivgitcode/secondmind)

**Stop explaining your last debugging session to your next one.**

You spend an hour with an AI assistant working out why the payment webhook fails.
You close the laptop. Tomorrow you open a different repo, start a fresh session,
and your assistant knows none of it — not what you found, not what you already
tried and ruled out.

secondmind keeps the useful parts. Your assistant can look them up later, even in
a different project, even in a different AI tool.

---

## Quick start

Run with `npx` (no install needed) or install globally:

```bash
# Option A: Run directly with npx
npx @shiv_2608/secondmind@latest init

# Option B: Install globally
npm install -g @shiv_2608/secondmind@latest
secondmind init
```

`init` configures the database and shows how to connect your tool.

### Connect your AI tool

Pick the snippet for your editor:

#### Claude Code
```bash
claude mcp add secondmind -- npx -y @shiv_2608/secondmind@latest mcp
# or if installed globally:
claude mcp add secondmind -- secondmind mcp
```

#### Cursor (`~/.cursor/mcp.json` or Project Settings > MCP)
```json
{
  "mcpServers": {
    "secondmind": {
      "command": "npx",
      "args": ["-y", "@shiv_2608/secondmind@latest", "mcp"]
    }
  }
}
```

#### Windsurf (`~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "secondmind": {
      "command": "npx",
      "args": ["-y", "@shiv_2608/secondmind@latest", "mcp"]
    }
  }
}
```

#### VS Code (Cline / Roo Code / Continue)
Add to your extension's MCP configuration:
```json
{
  "mcpServers": {
    "secondmind": {
      "command": "npx",
      "args": ["-y", "@shiv_2608/secondmind@latest", "mcp"]
    }
  }
}
```

That's it. No account, no API key, nothing to run. Now work normally.

> **Why `@latest`?** `npx` caches packages, so without it your AI tool can keep
> running an old copy long after a new version is out.

### Updating

```bash
npm install -g @shiv_2608/secondmind@latest   # if you installed globally
rm -rf ~/.npm/_npx                            # if you use npx and have an old copy cached
```

Then restart your AI tool. Your notes are upgraded in place the first time the new
version opens them, and the Claude Code skill refreshes itself.

If you previously let `compact` or `save_session` pick up `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` on its own: since v0.2.0 a key alone isn't enough, so set
`SECONDMIND_PROVIDER` (see [Capturing whole sessions](#capturing-whole-sessions)).

Want to try it from your terminal without any AI tool involved?

```bash
secondmind remember "the orders API rejects a webhook if the order is already paid"
secondmind search "duplicate payments"
secondmind browse
```

---

## What it actually looks like

**Monday**, in `checkout-service`, you and your assistant work out that inventory
checks keep failing. Your assistant saves the finding:

```
warehouse-service returns available_quantity, but checkout-service
expects quantity — so validation always fails
```

**Thursday**, in `inventory-service`, with a different assistant, you ask
*"why are some inventory checks failing?"* Before answering, it looks in secondmind
and gets back:

```
From your previous sessions:

[1] discovery · checkout-service · 3 days ago
warehouse-service returns available_quantity but checkout-service expects
quantity, so validation always fails
    also relevant to: inventory-service warehouse-service
```

You didn't explain anything. That's the whole product.

---

## How to use it with your AI assistant

When secondmind is connected via MCP, your assistant sees three tools: `search_context`, `remember_context`, and `save_session`.

### 1. Hands-free (Automatic)
You don't need to change how you work. secondmind gives your assistant instructions at connect time:
- At the **start** of any debugging task or investigation, your assistant automatically calls `search_context` to see if you solved something similar in another repo.
- Whenever a finding, dead-end, or decision is **confirmed**, your assistant automatically calls `remember_context` to store it with relevant keywords and affected services.

In Claude Code, `secondmind init` also installs a small skill
(`~/.claude/skills/secondmind/SKILL.md`) so Claude recognises those moments even
more reliably. Other agents get the same guidance through MCP.

**Rather it only saved when you ask?**

```bash
secondmind auto off   # saves only when you say "remember this"
secondmind auto on    # back to hands-free
secondmind auto       # which is it right now?
```

One switch covers every agent: it changes what the MCP server tells each tool,
and adds or removes the Claude Code skill. It applies from your next session.
Searching past notes stays automatic either way.

### 2. What to say to your assistant (Prompts)
You can also steer your assistant explicitly using plain English in your chat:

| What you want | What to say in chat | What happens |
|---|---|---|
| **Save an insight** | *"Remember this for next time: the orders API rejects a webhook if the order is already paid."* | Calls `remember_context`, automatically generating search keywords and tagging affected services. |
| **Search past knowledge** | *"Check secondmind: why did payment retries fail last week?"* | Calls `search_context` across all your repos, ranking by relevance and recency. |
| **Cross-repo context** | *"What do we know about auth token refresh from our other services?"* | Calls `search_context` with cross-project boosting. |
| **Wrap up a session** | *"Wrap up this session and save what we learned to secondmind."* | Calls `save_session` to read the conversation, extract 3–8 key discoveries/dead-ends, and store them. |

---

## Commands

| Command | What it does |
|---|---|
| `secondmind init` | Set up, and show how to connect your AI tool |
| `secondmind remember "<what>"` | Save something you want to know next time |
| `secondmind search "<what>"` | Look for it later |
| `secondmind browse` | Interactive: filter as you type, read, delete |
| `secondmind list` | Print the most recent notes |
| `secondmind compact <file>` | Read a whole session transcript and save what mattered |
| `secondmind forget <id>` | Delete one note |
| `secondmind stats` | What's stored, and which model reads transcripts |
| `secondmind auto [on\|off]` | Whether your assistant saves findings without being asked |
| `secondmind export [file]` | Every note as JSON, or markdown with `.md` / `-f md` |
| `secondmind import <file>` | Merge an export in — safe to run more than once |
| `secondmind sync <folder>` | Two-way sync through a folder you already sync |

In `browse`: type to filter, `↑↓` to move, `⏎` to open a note, `d` then `y` to
delete it, `esc` to quit.

Useful flags on `remember`:

```bash
secondmind remember "warehouse-service returns available_quantity, not quantity" \
  --keywords "inventory,stock check,quantity mismatch" \
  --related  "inventory-service,warehouse-service"
```

- `--keywords` — other words you might search for later. Worth adding (see
  [Where this falls short](#where-this-falls-short)).
- `--related` — other projects this affects. This is what makes a note written in
  one repo show up while you're working in another.

`--project` overrides the project name, which otherwise comes from your git
remote. `--all` searches every project instead of just this one.

---

## Capturing whole sessions

Saving individual notes needs nothing. Reading an entire transcript and pulling
the findings out of it needs a model — and secondmind tries to borrow one before
asking you for a key.

**1. Your coding agent's own model.** If your agent supports MCP sampling,
secondmind asks *it* to do the reading. A Cursor user gets whatever model Cursor
is running, a Gemini CLI user gets Gemini. No API key, no configuration, no
second bill. This is tried first, always.

**2. A local model.** If your agent can't do that, point secondmind at any
OpenAI-compatible server on your machine:

```bash
export SECONDMIND_BASE_URL=http://localhost:11434/v1 # Ollama, LM Studio, vLLM
export SECONDMIND_MODEL=llama3.2                     # (local needs no key)
```

**3. A cloud provider — only if you name one.** Having `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` in your environment is not enough; a transcript only goes to a
cloud provider when you pick it explicitly:

```bash
export SECONDMIND_PROVIDER=anthropic                 # Claude
export ANTHROPIC_API_KEY=sk-ant-...

export SECONDMIND_PROVIDER=openai                    # OpenAI
export OPENAI_API_KEY=sk-...
export SECONDMIND_MODEL=gpt-4o-mini

export SECONDMIND_PROVIDER=openai                    # OpenRouter, Gemini, any
export SECONDMIND_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_API_KEY=sk-or-...
export SECONDMIND_MODEL=...
```

Anything speaking the OpenAI chat-completions shape works. To pin the order, or
to skip a provider, write `~/.secondmind/config.json`:

```json
{ "providers": ["agent", "openai"], "model": "llama3.2", "baseUrl": "http://localhost:11434/v1" }
```

Listing `providers` there (or in `SECONDMIND_PROVIDER`) is what allows cloud
hosts. `secondmind stats` shows the order in effect and whether cloud providers
are allowed.

### Doing it automatically

Ask your assistant to save the session — it has a `save_session` tool. Or, in
Claude Code, run it every time a session ends by adding this to
`~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "secondmind compact \"$(jq -r .transcript_path)\"" }] }
    ]
  }
}
```

Before relying on it, know what it needs:

- **A model you've chosen.** The hook runs outside your coding session, so it can't
  borrow your agent's model. It needs either a local model (`SECONDMIND_BASE_URL`)
  or a cloud provider you've named (`SECONDMIND_PROVIDER`), set where the hook can
  see it — your shell profile, or an `"env"` block in the same `settings.json`.
  With neither, the hook does nothing.
- **`secondmind` on your PATH** (`npm install -g`) and **`jq`** installed.
- **Claude Code.** Other tools don't have an equivalent hook yet; there, findings are
  saved by your assistant during the session.

Check it works by running the same command on a real transcript:
`secondmind compact ~/.claude/projects/<project>/<session>.jsonl`. If it prints
"No way to read the transcript", the hook would fail the same way.

Using sync? Add `; secondmind sync ~/Sync/secondmind` to the end of the command.

---

## Your data

Everything lives in one SQLite file on your machine:

```
~/.secondmind/memory.db
```

No account, no telemetry, nothing uploaded. The file is created readable by you
only (`0600`). The single exception is reading a transcript, which sends it to
whichever model you picked above — your coding agent's own model or a local one
by default, and a cloud provider only if you named one.

Things that look like credentials — API keys, tokens, private keys, passwords in
connection strings — are replaced with `[redacted]` before a transcript is sent
to any model and before any note is saved. It's pattern matching, so treat it as
a safety net rather than a guarantee.

The database carries a schema version, so upgrading secondmind migrates your
notes in place, and an older secondmind refuses to open a newer database rather
than damaging it.

### Backups and more than one machine

```bash
secondmind export notes.json        # everything, importable
secondmind export notes.md          # everything, for reading
secondmind import notes.json        # merge it back in; duplicates are skipped
```

To share notes between your laptop and your desktop, point both at a folder you
already sync — Syncthing, Dropbox, iCloud Drive, or a private git repo:

```bash
secondmind sync ~/Sync/secondmind
```

Each machine writes only its own file (`<hostname>.json`) and reads everyone
else's, so there's nothing to conflict. Deleting a note on one machine deletes
it on the others at their next sync. Run it whenever you like, or add it to the
session-end hook below. Nothing about this involves a server: the folder is
the sync.

To read your notes: `secondmind browse`. To delete one: `secondmind forget 12`.
To delete everything: `rm ~/.secondmind/memory.db`.

Set `SECONDMIND_HOME` to keep the database somewhere else.

---

## Where this falls short

Worth knowing before you rely on it:

- **Search matches words, not meaning.** A note saying *"webhooks must be
  idempotent"* will not be found by searching *"duplicate deliveries"* unless one
  of those words is in the note or its keywords. Notes saved by your assistant get
  keywords automatically. Notes you type yourself don't — so add `--keywords` when
  the obvious search term isn't already in the sentence.
- **`search` and `browse` match differently.** `search` stems words, so "retries"
  finds "retry", but it needs whole words. `browse` matches partial words as you
  type, but doesn't stem. Neither understands synonyms.
- **Old notes can be wrong.** Nothing detects that a decision was reversed later.
  Newer notes rank higher, but both are still returned. Use `d` in `browse` on
  notes that have gone stale.
- **Nothing is captured unless something captures it.** Either your assistant saves
  as it works, or you set up the session-end hook, or you run `compact` yourself.

---

## How it's put together

```
src/
  core/      store (SQLite + FTS5), ranking, project detection, transcripts
  extract/   one prompt, three ways to run it: agent, anthropic, openai
  mcp/       the three tools your assistant sees
  cli/       commands, rendering, the browse screen
  config.ts  provider order and model selection
```

Notes live in one table with a full-text index over content, keywords, files and
related projects. Ranking is bm25 adjusted for project, importance, provenance
and age — the current project is a boost rather than a filter, which is what lets
a finding cross repositories.

## Requirements

Node 20 or newer.

## Development

```bash
npm install
npm test      # builds, then runs the suite
npm run build
```

## License

MIT
