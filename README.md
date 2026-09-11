# secondmind

**Stop explaining your last debugging session to your next one.**

You spend an hour with an AI assistant working out why the payment webhook fails.
You close the laptop. Tomorrow you open a different repo, start a fresh session,
and your assistant knows none of it — not what you found, not what you already
tried and ruled out.

secondmind keeps the useful parts. Your assistant can look them up later, even in
a different project, even in a different AI tool.

---

## Quick start

```bash
npm install -g secondmind
secondmind init
```

`init` prints one line to connect your AI tool. For Claude Code that's:

```bash
claude mcp add secondmind -- secondmind mcp
```

That's it. No account, no API key, nothing to run. Now work normally.

Want to try it without any AI tool involved?

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

**2. A provider you configure.** If your agent can't do that, set any one of:

```bash
export ANTHROPIC_API_KEY=sk-ant-...                  # Claude

export OPENAI_API_KEY=sk-...                         # OpenAI
export SECONDMIND_MODEL=gpt-4o-mini

export SECONDMIND_BASE_URL=http://localhost:11434/v1 # Ollama, LM Studio, vLLM
export SECONDMIND_MODEL=llama3.2                     # (local needs no key)

export SECONDMIND_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_API_KEY=sk-or-...                      # OpenRouter, Gemini, any
export SECONDMIND_MODEL=...                          # OpenAI-compatible endpoint
```

Anything speaking the OpenAI chat-completions shape works. To pin the order, or
to skip a provider, write `~/.secondmind/config.json`:

```json
{ "providers": ["agent", "openai"], "model": "llama3.2", "baseUrl": "http://localhost:11434/v1" }
```

`secondmind stats` shows which order is in effect.

### Doing it automatically

Ask your assistant to save the session — it has a `save_session` tool. Or run it
on every session end. In Claude Code, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "secondmind compact \"$(jq -r .transcript_path)\"" }] }
    ]
  }
}
```

---

## Your data

Everything lives in one SQLite file on your machine:

```
~/.secondmind/memory.db
```

No account, no telemetry, nothing uploaded. The single exception is reading a
transcript, which sends it to whichever model you picked above — and when that's
your coding agent's own model, it never leaves the tool you were already using.

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
