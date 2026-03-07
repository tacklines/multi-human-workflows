import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { RouterLocation } from '@vaadin/router';
import {
  fetchOrgProjects,
  createOrgProject,
  loadAndSelectOrg,
  getCurrentOrg,
  type OrgView,
} from '../../state/org-api.js';
import type { ProjectView } from '../../state/project-api.js';
import { navigateTo } from '../../router.js';
import { t } from '../../lib/i18n.js';
import { formatDate } from '../../lib/date-utils.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';

@customElement('org-dashboard')
export class OrgDashboard extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100%;
      padding: 3rem 2rem;
      background: var(--surface-1, #111320);
    }

    .header {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .header h1 {
      margin: 0 0 0.5rem;
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.025em;
    }

    .header p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 1rem;
    }

    .org-nav {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      width: 100%;
      max-width: 56rem;
      justify-content: flex-end;
    }

    .project-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
      width: 100%;
      max-width: 56rem;
    }

    .project-card {
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-large);
      padding: 1.5rem;
      background: var(--surface-card);
      box-shadow: var(--shadow-md);
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
    }

    .project-card:hover {
      border-color: var(--color-primary-border);
      box-shadow: var(--shadow-lg);
      transform: translateY(-2px);
    }

    .project-card .name {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 0.5rem;
    }

    .project-card .meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .project-card .prefix {
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      background: var(--surface-active);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .new-project-card {
      cursor: pointer;
      border: 2px dashed var(--border-medium);
      border-radius: var(--sl-border-radius-large);
      padding: 1.5rem;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-tertiary);
      transition: border-color 0.2s, color 0.2s;
      min-height: 100px;
    }

    .new-project-card:hover {
      border-color: var(--sl-color-primary-500);
      color: var(--sl-color-primary-400);
    }

    .new-project-card sl-icon { font-size: 1.5rem; }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  location!: RouterLocation;

  @state() private _org: OrgView | null = null;
  @state() private _projects: ProjectView[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _showCreateDialog = false;
  @state() private _newProjectName = '';
  @state() private _newProjectPrefix = '';
  @state() private _newProjectRepo = '';
  @state() private _creating = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const slug = (this.location?.params as Record<string, string>)?.slug;
      this._org = await loadAndSelectOrg(slug);
      this._projects = await fetchOrgProjects(this._org.slug);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgDashboard.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private _selectProject(project: ProjectView) {
    const slug = this._org?.slug;
    if (slug) {
      navigateTo(`/orgs/${slug}/projects/${project.id}`);
    }
  }

  private async _createProject() {
    if (!this._newProjectName.trim() || !this._org) return;
    this._creating = true;
    try {
      const project = await createOrgProject(
        this._org.slug,
        this._newProjectName.trim(),
        this._newProjectPrefix.trim() || undefined,
        this._newProjectRepo.trim() || undefined,
      );
      this._projects = [...this._projects, project];
      this._showCreateDialog = false;
      this._newProjectName = '';
      this._newProjectPrefix = '';
      this._newProjectRepo = '';
      this._selectProject(project);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgDashboard.errorCreate');
    } finally {
      this._creating = false;
    }
  }

  private _isAdmin(): boolean {
    return this._org?.role === 'owner' || this._org?.role === 'admin';
  }

  render() {
    if (this._loading) {
      return html`<div class="container"><div class="loading-container"><sl-spinner style="font-size: 2rem;"></sl-spinner></div></div>`;
    }

    return html`
      <div class="container">
        <div class="header">
          <h1>${this._org?.name ?? t('orgDashboard.fallbackName')}</h1>
          <p>
            ${this._org?.personal ? t('orgDashboard.personalWorkspace') : t('orgDashboard.members', { count: this._org?.member_count ?? 0, suffix: (this._org?.member_count ?? 0) !== 1 ? 's' : '' })}
          </p>
        </div>

        ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem; max-width: 56rem; width: 100%;">${this._error}</sl-alert>` : nothing}

        ${this._isAdmin() ? html`
          <div class="org-nav">
            <sl-button size="small" variant="text" @click=${() => navigateTo(`/orgs/${this._org!.slug}/settings`)}>
              <sl-icon slot="prefix" name="gear"></sl-icon>
              ${t('orgDashboard.settings')}
            </sl-button>
          </div>
        ` : nothing}

        <div class="project-grid">
          ${this._projects.map(p => html`
            <div class="project-card" role="button" tabindex="0"
                 @click=${() => this._selectProject(p)}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._selectProject(p); } }}>
              <p class="name">${p.name}</p>
              <div class="meta">
                <span class="prefix">${p.ticket_prefix}</span>
                <span>${t('orgDashboard.created', { date: formatDate(p.created_at) })}</span>
              </div>
            </div>
          `)}
          <div class="new-project-card" role="button" tabindex="0"
               @click=${() => { this._showCreateDialog = true; }}
               @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._showCreateDialog = true; } }}>
            <sl-icon name="plus-lg"></sl-icon>
            <span>${t('orgDashboard.newProject')}</span>
          </div>
        </div>

        <sl-dialog label=${t('orgDashboard.dialogLabel')} ?open=${this._showCreateDialog}
                   @sl-after-hide=${() => { this._showCreateDialog = false; }}>
          <div class="dialog-form">
            <sl-input label=${t('orgDashboard.nameLabel')} placeholder=${t('orgDashboard.namePlaceholder')}
                      value=${this._newProjectName}
                      @sl-input=${(e: CustomEvent) => { this._newProjectName = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
            <sl-input label=${t('orgDashboard.prefixLabel')} placeholder=${t('orgDashboard.prefixPlaceholder')} help-text=${t('orgDashboard.prefixHelp')}
                      value=${this._newProjectPrefix}
                      @sl-input=${(e: CustomEvent) => { this._newProjectPrefix = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
            <sl-input label=${t('orgDashboard.repoLabel')} placeholder=${t('orgDashboard.repoPlaceholder')} help-text=${t('orgDashboard.repoHelp')}
                      value=${this._newProjectRepo}
                      @sl-input=${(e: CustomEvent) => { this._newProjectRepo = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
          </div>
          <sl-button slot="footer" variant="primary" ?loading=${this._creating} @click=${() => void this._createProject()}>
            ${t('orgDashboard.create')}
          </sl-button>
        </sl-dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'org-dashboard': OrgDashboard;
  }
}
