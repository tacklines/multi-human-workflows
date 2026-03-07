import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchWorkspaces,
  stopWorkspace,
  destroyWorkspace,
  type WorkspaceView,
} from "../../state/workspace-api.js";
import { t } from "../../lib/i18n.js";
import { relativeTime } from "../../lib/date-utils.js";
import { WS_STATUS_VARIANT } from "../../lib/participant-utils.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

@customElement("workspace-list")
export class WorkspaceList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--text-tertiary);
      font-size: 0.9rem;
    }

    .empty-state sl-icon {
      font-size: 2.5rem;
      display: block;
      margin: 0 auto 1rem;
      opacity: 0.4;
    }

    .ws-table {
      width: 100%;
      border-collapse: collapse;
    }

    .ws-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: background 0.15s;
    }

    .ws-row:last-child {
      border-bottom: none;
    }

    .ws-row:hover {
      background: var(--surface-hover);
    }

    .ws-name {
      font-family: var(--sl-font-mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
      min-width: 10rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ws-template {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .ws-branch {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .ws-participant {
      font-size: 0.8rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .ws-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .ws-error {
      font-size: 0.8rem;
      color: var(--sl-color-danger-500);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 12rem;
    }

    .spacer {
      flex: 1;
    }

    .ws-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .list-container {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      overflow: hidden;
    }
  `;

  @property() projectId = "";

  @state() private _workspaces: WorkspaceView[] = [];
  @state() private _loading = true;
  @state() private _error = "";
  private _refreshTimer: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearRefreshTimer();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("projectId") && this.projectId) {
      void this._load();
    }
  }

  private async _load() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = "";
    try {
      this._workspaces = await fetchWorkspaces(this.projectId);
      this._scheduleRefreshIfNeeded();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : "Failed to load workspaces";
    } finally {
      this._loading = false;
    }
  }

  private _scheduleRefreshIfNeeded() {
    this._clearRefreshTimer();
    const hasPending = this._workspaces.some((w) =>
      ["pending", "creating", "stopping"].includes(w.status),
    );
    if (hasPending) {
      this._refreshTimer = window.setTimeout(() => {
        void this._load();
      }, 10000);
    }
  }

  private _clearRefreshTimer() {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  private _selectWorkspace(workspaceId: string) {
    this.dispatchEvent(
      new CustomEvent("workspace-select", {
        detail: { workspaceId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async _stopWorkspace(workspaceId: string) {
    try {
      await stopWorkspace(this.projectId, workspaceId);
      this._workspaces = this._workspaces.map((w) =>
        w.id === workspaceId ? { ...w, status: "stopping" as const } : w,
      );
    } catch (err) {
      console.error("Failed to stop workspace", err);
    }
  }

  private async _destroyWorkspace(workspaceId: string) {
    try {
      await destroyWorkspace(this.projectId, workspaceId);
      this._workspaces = this._workspaces.filter((w) => w.id !== workspaceId);
    } catch (err) {
      console.error("Failed to destroy workspace", err);
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading"><sl-spinner></sl-spinner></div>`;
    }

    if (this._error) {
      return html`<sl-alert variant="danger" open>${this._error}</sl-alert>`;
    }

    const visible = this._workspaces.filter((w) => w.status !== "destroyed");

    if (visible.length === 0) {
      return html`
        <div class="empty-state">
          <sl-icon name="terminal"></sl-icon>
          ${t("workspaceList.empty")}
        </div>
      `;
    }

    return html`
      <div class="list-container">
        ${visible.map((w) => this._renderRow(w))}
      </div>
    `;
  }

  private _renderRow(w: WorkspaceView) {
    return html`
      <div
        class="ws-row"
        role="button"
        tabindex="0"
        @click=${(e: MouseEvent) => {
          if ((e.target as HTMLElement).closest(".ws-actions")) return;
          this._selectWorkspace(w.id);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter") this._selectWorkspace(w.id);
        }}
      >
        <span class="ws-name"
          >${w.coder_workspace_name ?? w.id.slice(0, 8)}</span
        >
        <sl-badge variant=${WS_STATUS_VARIANT[w.status] ?? "neutral"}>
          ${w.status}
        </sl-badge>
        <span class="ws-template">${w.template_name}</span>
        ${w.branch ? html`<span class="ws-branch">${w.branch}</span>` : nothing}
        ${w.participant_name
          ? html`<span class="ws-participant">${w.participant_name}</span>`
          : nothing}
        ${w.error_message
          ? html`
              <sl-tooltip content=${w.error_message}>
                <span class="ws-error">${w.error_message}</span>
              </sl-tooltip>
            `
          : nothing}
        <span class="spacer"></span>
        ${w.started_at
          ? html`<span class="ws-time"
              >${relativeTime(w.started_at)}</span
            >`
          : nothing}
        <div class="ws-actions">
          ${w.status === "running"
            ? html`
                <sl-tooltip content=${t("workspaceDetail.stop")}>
                  <sl-icon-button
                    name="stop-circle"
                    label=${t("workspaceDetail.stop")}
                    style="font-size: 1rem; color: var(--sl-color-warning-500);"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      void this._stopWorkspace(w.id);
                    }}
                  ></sl-icon-button>
                </sl-tooltip>
              `
            : ["pending", "creating", "failed", "stopped"].includes(w.status)
              ? html`
                  <sl-tooltip content=${t("workspaceDetail.destroy")}>
                    <sl-icon-button
                      name="trash"
                      label=${t("workspaceDetail.destroy")}
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-list": WorkspaceList;
  }
}
