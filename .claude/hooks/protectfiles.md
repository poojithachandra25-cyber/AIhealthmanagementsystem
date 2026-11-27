# Protected files

`CLAUDE.md` is protected. Claude Code may read it but must not change it.

## How it works

- `.claude/settings.json` registers a **PreToolUse** hook for the tools that can change files:
  `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Bash` and `PowerShell`.
- The hook runs `.claude/hooks/protect-claude-md.js` with the tool call as JSON on stdin. It answers
  `permissionDecision: "deny"` when the call would change `CLAUDE.md`:
  - a file-tool edit of any file named `CLAUDE.md` (any folder, any letter case)
  - a shell or PowerShell command that mentions `CLAUDE.md` and would write, move, delete or
    rewrite it. That covers redirects (`>`, `>>`), `sed -i`, `tee`, `cp`/`mv`/`rm`,
    `Set-Content`/`Out-File`/`Remove-Item`, and Node or Python file writes.
- Reading is still allowed: the `Read` tool, `cat`, `grep`, `Get-Content` and so on.
- If the hook itself fails, for example because `node` is missing, the tool call is blocked
  (`onFailure: "block"`). The protection fails closed.

Because the hook lives in the checked-in project settings, it applies to **everyone** who runs
Claude Code in this repository.

## Changing CLAUDE.md as the owner

Pick one of these:

1. Edit the file yourself in your editor. Hooks only govern Claude Code, not your own typing.
2. Let your own Claude Code session edit it. Add this to **your** `.claude/settings.local.json`
   (personal and git-ignored, so teammates don't get it), then restart Claude Code:

   ```json
   { "env": { "CLAUDE_MD_UNLOCK": "1" } }
   ```

   Remove it again afterwards.

## Protection against people (not just Claude)

The hook only governs Claude Code. A person editing the file in VS Code or any other program
never triggers it. Three more layers cover people:

1. **Read-only lock.**
   - The file has the **read-only attribute**.
   - `.vscode/settings.json` opens it **read-only in VS Code** (`files.readonlyInclude`).
   - A **Windows deny rule** for *Everyone* stops anything from overwriting, appending to, deleting or
     replacing it, or clearing the read-only flag. Unlike the plain read-only flag, VS Code's "Overwrite"
     can't get past this, because an explicit deny beats the owner's allow. Reading still works.

   Lock (PowerShell, in the project folder):

   ```powershell
   attrib +R CLAUDE.md
   icacls CLAUDE.md /deny "*S-1-1-0:(WD,AD,WEA,WA,DE)"
   ```

   Check: `icacls CLAUDE.md` lists `Everyone:(DENY)(...)`.

   Unlock to edit, then lock again afterwards:

   ```powershell
   icacls CLAUDE.md /remove:d "*S-1-1-0"
   attrib -R CLAUDE.md
   ```
2. **Windows permissions.** The project lives in your user folder. Only your account, `SYSTEM`
   and `Administrators` can access it, so other standard Windows users can't read or change it.
   An administrator (or you, as the owner) can always override file permissions.
3. **Shared Git repository (when you push it).** Add `.github/CODEOWNERS` with
   `/CLAUDE.md @your-github-username` and turn on branch protection with "Require review from
   Code Owners". Teammates can then only change CLAUDE.md through a pull request you approve.

For Claude to edit it, both the read-only flag and the hook must be lifted: run
`attrib -R CLAUDE.md` and set `CLAUDE_MD_UNLOCK=1` in your `.claude/settings.local.json`.

## Limits

- The file's owner and administrators can always undo these protections. Nothing on your own
  computer can lock you out of your own file. For a hard guarantee against other people, rely on
  layers 2 and 3.
- Anyone who can edit `.claude/settings.json` or this script can switch the protection off, so
  protect those the same way, for example with `CODEOWNERS`.

To review or disable the hook, use `/hooks` in Claude Code.
