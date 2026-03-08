import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";
import {
  stopWorkspace,
  destroyWorkspace,
  type WorkspaceView,
} from "../../state/workspace-api.js";
import { store, type SessionView } from "../../state/app-state.js";
import { connectSession } from "../../state/session-connection.js";
import { authStore } from "../../state/auth-state.js";
import { createSession, joinSessionByCode } from "../../state/session-api.js";
import { navigateTo } from "../../router.js";
import { type ProjectView } from "../../state/project-api.js";
import { t } from "../../lib/i18n.js";
import { formatDate, relativeTime } from "../../lib/date-utils.js";
import { WS_STATUS_VARIANT } from "../../lib/participant-utils.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";

import "../invocations/invoke-dialog.js";

@customElement("project-overview")
export class ProjectOverview extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Repo info ── */
    .repo-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      font-size: 0.85rem;
    }

    .repo-info sl-icon {
      font-size: 1rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .repo-link {
      color: var(--sl-color-primary-400);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .repo-link:hover {
      text-decoration: underline;
    }

    .branch-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    /* ── Section headers ── */
    .section {
      margin-bottom: 2rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .section-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Sessions grid ── */
    .sessions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.75rem;
    }

    .session-card {
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: var(--surface-card);
      box-shadow: var(--shadow-xs);
      transition:
        border-color 0.2s,
        box-shadow 0.2s,
        transform 0.15s;
    }

    .session-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .session-card .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .session-card .code {
      font-family: var(--sl-font-mono);
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--sl-color-primary-400);
      letter-spacing: 0.08em;
    }

    .session-card .date {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .session-card .name {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-card .participants {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .session-card .participants sl-icon {
      font-size: 0.85rem;
    }

    .online-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
      margin-right: 0.15rem;
    }

    .new-session-card {
      cursor: pointer;
      border: 2px dashed var(--border-medium);
      border-radius: var(--sl-border-radius-large);
      padding: 1.25rem;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-tertiary);
      transition:
        border-color 0.2s,
        color 0.2s;
      min-height: 100px;
    }

    .new-session-card:hover {
      border-color: var(--sl-color-primary-500);
      color: var(--sl-color-primary-400);
    }

    .new-session-card sl-icon {
      font-size: 1.25rem;
    }

    /* ── Workspace list ── */
    .workspace-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    .workspace-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      background: var(--surface-card);
      font-size: 0.875rem;
      cursor: pointer;
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
    }

    .workspace-row:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .workspace-row:hover {
      background: var(--surface-hover, var(--surface-active));
      border-color: var(--color-primary-border);
    }

    .ws-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
    }

    .ws-participant-name {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
      color: var(--sl-color-primary-400);
      min-width: 8rem;
    }

    .ws-template {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .ws-branch {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .ws-error {
      font-size: 0.75rem;
      color: var(--sl-color-danger-500);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 20rem;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";
  @property({ type: Object }) project: ProjectView | null = null;
  @property({ type: Array }) sessions: SessionView[] = [];
  @property({ type: Array }) workspaces: WorkspaceView[] = [];
  @property() orgSlug = "";

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;

  @state() private _showNewSession = false;
  @state() private _newSessionName = "";
  @state() private _creatingSess = false;
  @state() private _error = "";

  private _onlineCount(session: SessionView): number {
    return session.participants.filter((p) => p.is_online).length;
  }

  private async _createSession() {
    this._creatingSess = true;
    this._error = "";
    try {
      const data = await createSession({
        project_id: this.projectId,
        name: this._newSessionName.trim() || undefined,
      });
      store.setSession(
        data.session.code,
        data.session.participants[0]?.id,
        data.session,
        data.agent_code,
      );
      connectSession(data.session.code);
      navigateTo(`/sessions/${data.session.code}`);
      this._newSessionName = "";
      this._showNewSession = false;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorCreateSession");
    } finally {
      this._creatingSess = false;
    }
  }

  private async _joinSession(code: string) {
    const user = authStore.user;
    this._error = "";
    try {
      const data = await joinSessionByCode(code, user?.name ?? "Participant");
      store.setSession(
        code,
        data.participant_id,
        data.session,
        data.agent_code,
      );
      connectSession(code);
      navigateTo(`/sessions/${code}`);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("workspace.errorJoinSession");
    }
  }

  private async _stopWorkspace(workspaceId: string) {
    try {
      await stopWorkspace(this.projectId, workspaceId);
      this.dispatchEvent(
        new CustomEvent("workspaces-changed", {
          detail: {
            workspaces: this.workspaces.map((w) =>
              w.id === workspaceId ? { ...w, status: "stopping" as const } : w,
            ),
          },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      console.error("Failed to stop workspace", err);
    }
  }

  private async _destroyWorkspace(workspaceId: string) {
    try {
      await destroyWorkspace(this.projectId, workspaceId);
      this.dispatchEvent(
        new CustomEvent("workspaces-changed", {
          detail: {
            workspaces: this.workspaces.filter((w) => w.id !== workspaceId),
          },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      console.error("Failed to destroy workspace", err);
    }
  }

  private _renderAnalyzeDropdown() {
    return html`
      <div
        style="display: flex; justify-content: flex-end; margin-bottom: 1rem;"
      >
        <sl-dropdown>
          <sl-button
            slot="trigger"
            caret
            variant="default"
            size="small"
            outline
            aria-label=${t("dispatch.overview.button")}
            aria-haspopup="menu"
          >
            <sl-icon slot="prefix" name="robot"></sl-icon>
            ${t("dispatch.overview.button")}
          </sl-button>
          <sl-menu
            @sl-select=${(e: CustomEvent) => this._handleAnalyzeAction(e)}
          >
            <sl-menu-item value="summarize">
              <sl-icon slot="prefix" name="journal-text"></sl-icon>
              ${t("dispatch.overview.action.summarize")}
            </sl-menu-item>
            <sl-menu-item value="blockers">
              <sl-icon slot="prefix" name="exclamation-triangle"></sl-icon>
              ${t("dispatch.overview.action.blockers")}
            </sl-menu-item>
            <sl-divider></sl-divider>
            <sl-menu-item value="custom">
              <sl-icon slot="prefix" name="gear"></sl-icon>
              ${t("dispatch.overview.action.custom")}
            </sl-menu-item>
          </sl-menu>
        </sl-dropdown>
      </div>
    `;
  }

  private _handleAnalyzeAction(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    const projectName = this.project?.name ?? "this project";

    switch (action) {
      case "summarize":
        this._invokeDialog.showWithPerspective(
          "researcher",
          `Summarize the recent activity for project "${projectName}". Look at recent tasks, sessions, comments, and agent work to produce a concise summary of what has been happening and the current state of the project.`,
        );
        break;
      case "blockers":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Analyze the project "${projectName}" and identify any blockers, risks, or impediments to progress. Review open tasks, dependencies, and recent activity to surface issues that need attention.`,
        );
        break;
      case "custom":
      default:
        this._invokeDialog.show();
        break;
    }
  }

  private _renderRepo() {
    const p = this.project;
    if (!p?.repo_url) return nothing;
    return html`
      <div class="repo-info">
        <sl-icon name="github"></sl-icon>
        <a
          class="repo-link"
          href=${p.repo_url}
          target="_blank"
          rel="noopener noreferrer"
          >${p.repo_url}</a
        >
        ${p.default_branch
          ? html`<span class="branch-badge">${p.default_branch}</span>`
          : nothing}
      </div>
    `;
  }

  private _renderSessions() {
    const active = this.sessions.filter((s) => this._onlineCount(s) > 0);
    const inactive = this.sessions.filter((s) => this._onlineCount(s) === 0);

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="people-fill"></sl-icon>
            ${t("workspace.sessions")}
            <sl-badge variant="neutral" pill>${this.sessions.length}</sl-badge>
          </span>
        </div>

        <div class="sessions-grid">
          ${active.map((s) => this._renderSessionCard(s, true))}
          ${inactive.slice(0, 8).map((s) => this._renderSessionCard(s, false))}

          <div
            class="new-session-card"
            role="button"
            tabindex="0"
            @click=${() => {
              this._showNewSession = true;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this._showNewSession = true;
              }
            }}
          >
            <sl-icon name="plus-lg"></sl-icon>
            <span>${t("workspace.newSession")}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSessionCard(s: SessionView, hasOnline: boolean) {
    const online = this._onlineCount(s);
    return html`
      <div
        class="session-card"
        role="button"
        tabindex="0"
        @click=${() => void this._joinSession(s.code)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void this._joinSession(s.code);
          }
        }}
      >
        <div class="card-top">
          <span class="code">${s.code}</span>
          <span class="date">${formatDate(s.created_at)}</span>
        </div>
        <div class="name">${s.name || t("workspace.untitledSession")}</div>
        <div class="participants">
          ${hasOnline ? html`<span class="online-dot"></span>` : nothing}
          <sl-icon name="people"></sl-icon>
          ${hasOnline
            ? html`${t("workspace.online", { count: online })}`
            : html`${t("workspace.participants", {
                count: s.participants.length,
                suffix: s.participants.length !== 1 ? "s" : "",
              })}`}
        </div>
      </div>
    `;
  }

  private _renderWorkspaces() {
    const active = this.workspaces.filter((w) => w.status !== "destroyed");
    if (active.length === 0) return nothing;

    return html`
      <div class="section">
        <div class="section-header">
          <span class="section-title">
            <sl-icon name="terminal"></sl-icon>
            ${t("workspace.workspaces")}
            <sl-badge variant="neutral" pill>${active.length}</sl-badge>
          </span>
        </div>

        <div class="workspace-list">
          ${active.map(
            (w) => html`
              <div
                class="workspace-row"
                @click=${(e: MouseEvent) => {
                  if ((e.target as HTMLElement).closest(".ws-actions")) return;
                  this.dispatchEvent(
                    new CustomEvent("workspace-select", {
                      detail: { workspaceId: w.id },
                      bubbles: true,
                      composed: true,
                    }),
                  );
                }}
              >
                <span class="ws-name"
                  >${w.coder_workspace_name ?? w.id.slice(0, 8)}</span
                >
                ${w.participant_name
                  ? html`<span class="ws-participant-name"
                      >${w.participant_name}</span
                    >`
                  : nothing}
                <sl-badge variant=${WS_STATUS_VARIANT[w.status] ?? "neutral"}
                  >${w.status}</sl-badge
                >
                <span class="ws-template">${w.template_name}</span>
                ${w.branch
                  ? html`<span class="ws-branch">${w.branch}</span>`
                  : nothing}
                ${w.error_message
                  ? html`
                      <sl-tooltip content=${w.error_message}>
                        <span class="ws-error">${w.error_message}</span>
                      </sl-tooltip>
                    `
                  : nothing}
                <span style="flex: 1;"></span>
                ${w.started_at
                  ? html`
                      <span
                        style="font-size: 0.75rem; color: var(--text-tertiary);"
                      >
                        ${t("workspace.started", {
                          time: relativeTime(w.started_at),
                        })}
                      </span>
                    `
                  : nothing}
                <div class="ws-actions">
                  ${w.status === "running"
                    ? html`
                        <sl-tooltip content="Stop workspace">
                          <sl-icon-button
                            name="stop-circle"
                            label="Stop workspace"
                            style="font-size: 1rem; color: var(--sl-color-warning-500);"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              void this._stopWorkspace(w.id);
                            }}
                          ></sl-icon-button>
                        </sl-tooltip>
                      `
                    : ["pending", "creating", "failed", "stopped"].includes(
                          w.status,
                        )
                      ? html`
                          <sl-tooltip content="Destroy workspace">
                            <sl-icon-button
                              name="trash"
                              label="Destroy workspace"
                              style="font-size: 1rem; color: var(--sl-color-danger-500);"
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                void this._destroyWorkspace(w.id);
                              }}
                            ></sl-icon-button>
                          </sl-tooltip>
                        `
                      : nothing}
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this._error
        ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem;"
            >${this._error}</sl-alert
          >`
        : nothing}
      ${this._renderRepo()} ${this._renderAnalyzeDropdown()}
      ${this._renderSessions()} ${this._renderWorkspaces()}

      <invoke-dialog project-id=${this.projectId}></invoke-dialog>

      <sl-dialog
        label=${t("workspace.newSession")}
        ?open=${this._showNewSession}
        @sl-after-hide=${() => {
          this._showNewSession = false;
        }}
      >
        <div class="dialog-form">
          <sl-input
            label=${t("workspace.newSession.nameLabel")}
            placeholder=${t("workspace.newSession.namePlaceholder")}
            help-text=${t("workspace.newSession.nameHelp")}
            value=${this._newSessionName}
            @sl-input=${(e: CustomEvent) => {
              this._newSessionName = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") void this._createSession();
            }}
          ></sl-input>
        </div>
        <sl-button
          slot="footer"
          variant="primary"
          ?loading=${this._creatingSess}
          @click=${() => void this._createSession()}
        >
          ${t("workspace.newSession.create")}
        </sl-button>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "project-overview": ProjectOverview;
  }
}
