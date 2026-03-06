# Seam Workspace: Task Management via MCP

When `SEAM_TOKEN` is set (running as a Seam agent), all task management goes through Seam MCP tools. Do NOT use `bd` or `tk` CLI commands.

## Command Mapping

| Instead of | Use MCP tool |
|---|---|
| `bd create` | `create_task` |
| `bd list` | `list_tasks` |
| `bd show <id>` | `get_task` |
| `bd update <id>` | `update_task` |
| `bd close <id>` | `close_task` |
| `bd ready` / `bd stats` / `bd blocked` | `list_tasks` with status filters + `task_summary` |
| `bd dep add` | `add_dependency` |
| `bd sync` | Not needed (server persists automatically) |

## Communication

| Action | MCP tool |
|---|---|
| Progress updates / notes | `add_comment` |
| Ask human for clarification | `ask_question` |
| Check for human messages | `check_messages` |
| Send message to participant | `send_message` |

## When This Applies

- `SEAM_TOKEN` is set: use MCP tools above (this rule)
- `SEAM_TOKEN` is NOT set (local dev): use normal `bd`/`tk` workflow
