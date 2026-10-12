# Issue tracker: Linear

Issues and PRDs for this repo live in Linear. Use the Linear MCP tools for all operations.

- **Team:** `Mohamed Gassem`
- **Project:** `Jorg`
- **Issue prefix:** `MOH-` (reference issues as `MOH-123`, never `#123`)

## Conventions

- **Create an issue**: `save_issue` with `team: "Mohamed Gassem"`, `project: "Jorg"`, `title`, `description` (Markdown), `labels`. Set `milestone` when known (see "Project and milestone" below).
- **Read an issue**: `get_issue` with the `MOH-xxx` identifier. Pass `includeRelations: true` when you need blocking/parent relations.
- **List issues**: `list_issues` with `team: "Mohamed Gassem"` plus `project`, `state`, or `label` filters.
- **Comment**: `save_comment` with `issueId: "MOH-xxx"` and `body` (Markdown).
- **Change state**: `save_issue` with `id: "MOH-xxx"` and `state` (one of Backlog, Todo, In Progress, In Review, Done, Canceled).
- **Close**: set `state: "Done"`.
- **"Delete" an issue**: there is no hard delete via MCP. Set `state: "Canceled"`.

## Relations (prefer native over prose)

- **Sub-issue**: `save_issue` with `parentId: "MOH-parent"`.
- **Blocked by / blocks**: `save_issue` with `blockedBy: ["MOH-x"]` or `blocks: ["MOH-y"]` (append-only).

## Project and milestone

- Always assign `project: "Jorg"` on create.
- Set `milestone` to the one the user names. If none is named, call `list_milestones` with `project: "Jorg"` and use the active/current milestone. If none can be determined, create the issue without a milestone rather than failing.

## When a skill says "publish to the issue tracker"

Create a Linear issue with `save_issue` as above.

## When a skill says "fetch the relevant ticket"

Call `get_issue` with the `MOH-xxx` identifier.

## Closure via GitHub integration

Linear's native GitHub integration closes issues on PR merge when the PR is linked. Linking happens when the branch name contains `moh-xx` (use the `gitBranchName` Linear copies) or the PR body contains `Fixes MOH-xx`. Skills do not set `state: "Done"` on merge; the integration does.
