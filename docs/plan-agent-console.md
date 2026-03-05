# Agent Console & Workspace Viewer

## Vision
Click on an agent in the session to open a console-like panel showing their activity, send them messages, and view their workspace changes.

## Phase 1: Agent Console Panel (Frontend)
- [ ] New component `agent-console.ts` — slide-out drawer panel
- [ ] Agent header: name, type, status badge, sponsor info, workspace status
- [ ] Activity tab: filtered view of agent's actions (task updates, comments, questions)
- [ ] Message input: send a message to the agent (creates a directed comment)
- [ ] Wire presence-bar click → open agent console

## Phase 2: Backend - Agent Activity & Messaging
- [ ] `GET /api/sessions/:code/participants/:id/activity` — filtered domain events for a participant
- [ ] `POST /api/sessions/:code/participants/:id/messages` — send a directed message to a participant
- [ ] WebSocket broadcast for `agent_message` events
- [ ] MCP tool: `check_messages` — agent polls for directed messages

## Phase 3: Workspace Viewer
- [ ] Workspace status display with live polling
- [ ] Extend Coder client: `get_build_logs(workspace_id)`
- [ ] `GET /api/projects/:id/workspaces/:wid/logs` — build/agent logs
- [ ] `GET /api/projects/:id/workspaces/:wid/diff` — git diff from workspace
- [ ] Diff viewer component using a lightweight diff2html or custom renderer

## Phase 4: Polish
- [ ] Real-time activity updates via WebSocket
- [ ] Terminal-style scrolling with auto-follow
- [ ] Keyboard shortcut to close panel (Escape)
- [ ] Mobile responsive layout
