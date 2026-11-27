#!/usr/bin/env node
// PreToolUse hook: stops Claude Code from changing CLAUDE.md (see protectfiles.md).
//
// Blocks:
//   - Edit / Write / MultiEdit / NotebookEdit on any file named CLAUDE.md
//   - Bash / PowerShell commands that mention CLAUDE.md and would write, move,
//     delete or rewrite it (redirects, sed -i, tee, cp/mv/rm, Set-Content, node fs writes, …)
// Allows:
//   - Reading it (cat, grep, Get-Content, the Read tool, …)
//   - The owner, when CLAUDE_MD_UNLOCK=1 is set (e.g. in their own, git-ignored
//     .claude/settings.local.json "env" block). Teammates don't have it, so they stay blocked.
//
// Reads the hook payload as JSON on stdin; answers with a PreToolUse "deny" decision.

const PROTECTED = /(^|[\\/\s"'`=(])CLAUDE\.md\b/i;

// Ways a shell command can change a file. Matched only when CLAUDE.md is mentioned too.
const WRITE_PATTERNS = [
  />>?/, // redirection: > or >>
  /\bsed\b[^|;&]*\s-i/, // sed -i (in-place)
  /\bperl\b[^|;&]*\s-[a-z]*i/, // perl -i
  /\btee\b/,
  /\b(cp|mv|rm|unlink|truncate|touch|chmod|ln|dd|install)\b/,
  /\b(Set-Content|Add-Content|Out-File|Clear-Content|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item)\b/i,
  /\b(sc|ac|rm|del|ren|move|copy|ni)\b/i, // PowerShell / cmd aliases
  /\[System\.IO\.File\]::(Write|Append|Delete|Move|Copy)/i,
  /\b(writeFile|writeFileSync|appendFile|appendFileSync|rmSync|unlinkSync|renameSync|copyFileSync|createWriteStream)\b/,
  /\bopen\([^)]*['"][wa]/, // python open(..., 'w'/'a')
];

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  if (process.env.CLAUDE_MD_UNLOCK === '1') process.exit(0);

  const message =
    'CLAUDE.md is protected and cannot be edited by Claude Code in this project. ' +
    'Ask the project owner to change it (they can unlock edits with CLAUDE_MD_UNLOCK=1).';

  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    // Unreadable payload: fail closed if it mentions CLAUDE.md, otherwise let it through.
    if (/claude\.md/i.test(raw)) deny(message);
    process.exit(0);
  }
  const tool = payload.tool_name || '';
  const input = payload.tool_input || {};

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const target = String(input.file_path || input.notebook_path || '');
    const name = target.split(/[\\/]/).pop() || '';
    if (name.toLowerCase() === 'claude.md') deny(message);
    process.exit(0);
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = String(input.command || '');
    if (PROTECTED.test(command) && WRITE_PATTERNS.some((re) => re.test(command))) deny(message);
    process.exit(0);
  }

  process.exit(0);
});
