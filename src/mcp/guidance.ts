/**
 * What an agent is told about when to use secondmind. It reaches the agent two
 * ways: as MCP server instructions, which every client gets at connect time,
 * and as a Claude Code skill, which Claude loads whenever the task matches.
 * Both are generated here so they can never disagree.
 */

const SEARCH = `Call search_context at the START of any debugging, investigation, or "why does X happen" task, and before asking the user to explain background. The answer is often already there from a session in a different repo. Do this without being asked.`;

const WHAT_TO_SAVE = `- a discovery about how the system actually behaves
- an approach that did NOT work (this saves the most time later)
- a decision and the reason for it
- an unresolved question and the obvious next step

Save the finding, not the conversation, and write it so it stands alone — "it was the serializer" is useless later; name the service. Always fill in keywords (other words someone might search for, including synonyms for the concept) and related_projects (other services affected). A note saved without keywords may never be found again.`;

const AUTO_ON = `Call remember_context as soon as you confirm something worth knowing months from now, without waiting to be asked:
${WHAT_TO_SAVE}

Don't save guesses you haven't confirmed, secrets, or things that are obvious from reading the code.`;

const AUTO_OFF = `The user has turned automatic saving OFF. Do not call remember_context or save_session unless the user explicitly asks you to save or remember something. When they do:
${WHAT_TO_SAVE}`;

export function instructions(autoSave: boolean): string {
  return `secondmind is this user's memory of their past coding sessions, across every repository they work in.

${SEARCH}

${autoSave ? AUTO_ON : AUTO_OFF}`;
}

/** Installed only while automatic saving is on; `secondmind auto off` removes it. */
export function skill(): string {
  return `---
name: secondmind
description: The user's memory of past coding sessions across all their repos. Use at the start of any debugging, investigation or "why does X happen" task to check what earlier sessions found, and whenever a discovery, dead end or decision is confirmed, to save it with remember_context — without being asked. Needs the secondmind MCP server.
---

# secondmind

${instructions(true)}

## When a piece of work wraps up

Before you finish a task that involved real investigation, check whether its key findings were saved. If not, save each one with remember_context now — one note per finding.

## If the tools are missing

If search_context and remember_context are not available, the secondmind MCP server is not connected. Tell the user once: \`claude mcp add secondmind -- npx -y @shiv_2608/secondmind mcp\`. Don't keep mentioning it.

The user can turn automatic saving off with \`secondmind auto off\`.
`;
}
