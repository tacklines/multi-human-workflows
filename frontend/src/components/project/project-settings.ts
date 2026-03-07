import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchProject,
  updateProject,
  type ProjectView,
} from "../../state/project-api.js";
import {
  fetchCoderStatus,
  type CoderStatus,
} from "../../state/workspace-api.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

@customElement("project-settings")
export class ProjectSettings extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .settings-panel {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .settings-section {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.5rem;
    }

    .settings-section h3 {
      margin: 0 0 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .settings-form sl-input {
      --sl-input-font-size-medium: 0.875rem;
    }

    .settings-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.5rem;
    }

    .coder-info {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .coder-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
    }

    .coder-label {
      color: var(--text-tertiary);
      min-width: 6rem;
      flex-shrink: 0;
    }

    .coder-value {
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
      font-size: 0.8rem;
    }

    .template-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .template-chip {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";

  @state() private _project: ProjectView | null = null;
  @state() private _loading = true;

  @state() private _settingsName = "";
  @state() private _settingsPrefix = "";
  @state() private _settingsRepoUrl = "";
  @state() private _settingsDefaultBranch = "";
  @state() private _settingsSaving = false;
  @state() private _settingsMsg = "";
  @state() private _settingsMsgVariant: "success" | "danger" = "success";

  @state() private _coderStatus: CoderStatus | null = null;
  @state() private _coderLoading = false;

  connectedCallback() {
    super.connectedCallback();
    void this._loadData();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("projectId") && this.projectId) {
      void this._loadData();
    }
  }

  private async _loadData() {
    if (!this.projectId) return;
    this._loading = true;
    try {
      const project = await fetchProject(this.projectId);
      this._project = project;
      this._initSettingsForm();
    } finally {
      this._loading = false;
    }
    void this._loadCoderStatus();
  }

  private _initSettingsForm() {
    const p = this._project;
    if (!p) return;
    this._settingsName = p.name;
    this._settingsPrefix = p.ticket_prefix;
    this._settingsRepoUrl = p.repo_url ?? "";
    this._settingsDefaultBranch = p.default_branch ?? "";
    this._settingsMsg = "";
  }

  private async _loadCoderStatus() {
    this._coderLoading = true;
    try {
      this._coderStatus = await fetchCoderStatus();
    } catch {
      this._coderStatus = null;
    } finally {
      this._coderLoading = false;
    }
  }

  private async _saveSettings() {
    this._settingsSaving = true;
    this._settingsMsg = "";
    try {
      const updated = await updateProject(this.projectId, {
        name: this._settingsName.trim(),
        ticket_prefix: this._settingsPrefix.trim(),
        repo_url: this._settingsRepoUrl.trim() || undefined,
        default_branch: this._settingsDefaultBranch.trim() || undefined,
      });
      this._project = updated;
      this._settingsMsg = t("workspace.settings.saved");
      this._settingsMsgVariant = "success";
      this.dispatchEvent(
        new CustomEvent("project-updated", {
          detail: { project: updated },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      this._settingsMsg =
        err instanceof Error ? err.message : t("workspace.settings.errorSave");
      this._settingsMsgVariant = "danger";
    } finally {
      this._settingsSaving = false;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner style="font-size: 2rem;"></sl-spinner>
      </div>`;
    }

    return html`
      <div class="settings-panel">
        <div class="settings-section">
          <h3>${t("workspace.settings.title")}</h3>
          <div class="settings-form">
            <sl-input
              label=${t("workspace.settings.nameLabel")}
              value=${this._settingsName}
              @sl-input=${(e: CustomEvent) => {
                this._settingsName = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.prefixLabel")}
              value=${this._settingsPrefix}
              @sl-input=${(e: CustomEvent) => {
                this._settingsPrefix = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.repoLabel")}
              placeholder=${t("workspace.settings.repoPlaceholder")}
              value=${this._settingsRepoUrl}
              @sl-input=${(e: CustomEvent) => {
                this._settingsRepoUrl = (e.target as HTMLInputElement).value;
              }}
            ></sl-input>
            <sl-input
              label=${t("workspace.settings.branchLabel")}
              placeholder=${t("workspace.settings.branchPlaceholder")}
              value=${this._settingsDefaultBranch}
              @sl-input=${(e: CustomEvent) => {
                this._settingsDefaultBranch = (
                  e.target as HTMLInputElement
                ).value;
              }}
            ></sl-input>
            <div class="settings-actions">
              <sl-button
                variant="primary"
                ?loading=${this._settingsSaving}
                @click=${() => void this._saveSettings()}
              >
                ${t("workspace.settings.save")}
              </sl-button>
              ${this._settingsMsg
                ? html`
                    <sl-alert
                      variant=${this._settingsMsgVariant}
                      open
                      duration="4000"
                      @sl-after-hide=${() => {
                        this._settingsMsg = "";
                      }}
                    >
                      ${this._settingsMsg}
                    </sl-alert>
                  `
                : nothing}
            </div>
          </div>
        </div>

        <sl-divider></sl-divider>

        <div class="settings-section">
          <h3>${t("workspace.coder.title")}</h3>
          ${this._coderLoading
            ? html`
                <div
                  style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-tertiary); font-size: 0.85rem;"
                >
                  <sl-spinner style="font-size: 1rem;"></sl-spinner> ${t(
                    "workspace.coder.loading",
                  )}
                </div>
              `
            : this._coderStatus
              ? html`
                  <div class="coder-info">
                    <div class="coder-row">
                      <span class="coder-label"
                        >${t("workspace.coder.status")}</span
                      >
                      ${this._coderStatus.connected
                        ? html`<sl-badge variant="success"
                            >${t("workspace.coder.connected")}</sl-badge
                          >`
                        : this._coderStatus.enabled
                          ? html`<sl-badge variant="warning"
                              >${t(
                                "workspace.coder.enabledNotConnected",
                              )}</sl-badge
                            >`
                          : html`<sl-badge variant="neutral"
                              >${t("workspace.coder.disabled")}</sl-badge
                            >`}
                    </div>
                    ${this._coderStatus.url
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.url")}</span
                            >
                            <span class="coder-value"
                              >${this._coderStatus.url}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.user
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.user")}</span
                            >
                            <span class="coder-value"
                              >${this._coderStatus.user}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.error
                      ? html`
                          <div class="coder-row">
                            <span class="coder-label"
                              >${t("workspace.coder.error")}</span
                            >
                            <span
                              style="color: var(--sl-color-danger-500); font-size: 0.85rem;"
                              >${this._coderStatus.error}</span
                            >
                          </div>
                        `
                      : nothing}
                    ${this._coderStatus.templates.length > 0
                      ? html`
                          <div
                            class="coder-row"
                            style="align-items: flex-start;"
                          >
                            <span class="coder-label"
                              >${t("workspace.coder.templates")}</span
                            >
                            <div class="template-list">
                              ${this._coderStatus.templates.map(
                                (tmpl) =>
                                  html`<span class="template-chip"
                                    >${tmpl}</span
                                  >`,
                              )}
                            </div>
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : html`
                  <div style="color: var(--text-tertiary); font-size: 0.85rem;">
                    ${t("workspace.coder.loadError")}
                  </div>
                `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "project-settings": ProjectSettings;
  }
}
