import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { fetchProjects, createProject, type ProjectView } from '../../state/project-api.js';
import { navigateTo } from '../../router.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';

@customElement('project-list')
export class ProjectList extends LitElement {
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

    .new-project-card sl-icon {
      font-size: 1.5rem;
    }

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
    this._loadProjects();
  }

  private async _loadProjects() {
    this._loading = true;
    this._error = '';
    try {
      this._projects = await fetchProjects();
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('projectList.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private _selectProject(project: ProjectView) {
    navigateTo(`/projects/${project.id}`);
  }

  private async _createProject() {
    if (!this._newProjectName.trim()) return;
    this._creating = true;
    try {
      const project = await createProject(
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
      this._error = err instanceof Error ? err.message : t('projectList.errorCreate');
    } finally {
      this._creating = false;
    }
  }

  private _formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  render() {
    return html`
      <div class="container">
        <div class="header">
          <h1>${t('projectList.title')}</h1>
          <p>${t('projectList.subtitle')}</p>
        </div>

        ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem; max-width: 56rem; width: 100%;">${this._error}</sl-alert>` : nothing}

        ${this._loading ? html`
          <div class="loading-container">
            <sl-spinner style="font-size: 2rem;"></sl-spinner>
          </div>
        ` : html`
          <div class="project-grid">
            ${this._projects.map(p => html`
              <div class="project-card" role="button" tabindex="0"
                   @click=${() => this._selectProject(p)}
                   @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._selectProject(p); } }}>
                <p class="name">${p.name}</p>
                <div class="meta">
                  <span class="prefix">${p.ticket_prefix}</span>
                  <span>${t('projectList.created', { date: this._formatDate(p.created_at) })}</span>
                </div>
              </div>
            `)}
            <div class="new-project-card" role="button" tabindex="0"
                 @click=${() => { this._showCreateDialog = true; }}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._showCreateDialog = true; } }}>
              <sl-icon name="plus-lg"></sl-icon>
              <span>${t('projectList.newProject')}</span>
            </div>
          </div>
        `}

        <sl-dialog label=${t('projectList.dialogLabel')} ?open=${this._showCreateDialog}
                   @sl-after-hide=${() => { this._showCreateDialog = false; }}>
          <div class="dialog-form">
            <sl-input label=${t('projectList.nameLabel')} placeholder=${t('projectList.namePlaceholder')}
                      value=${this._newProjectName}
                      @sl-input=${(e: CustomEvent) => { this._newProjectName = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
            <sl-input label=${t('projectList.prefixLabel')} placeholder=${t('projectList.prefixPlaceholder')} help-text=${t('projectList.prefixHelp')}
                      value=${this._newProjectPrefix}
                      @sl-input=${(e: CustomEvent) => { this._newProjectPrefix = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
            <sl-input label=${t('projectList.repoLabel')} placeholder=${t('projectList.repoPlaceholder')} help-text=${t('projectList.repoHelp')}
                      value=${this._newProjectRepo}
                      @sl-input=${(e: CustomEvent) => { this._newProjectRepo = (e.target as HTMLInputElement).value; }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._createProject(); }}
            ></sl-input>
          </div>
          <sl-button slot="footer" variant="primary" ?loading=${this._creating} @click=${() => void this._createProject()}>
            ${t('projectList.create')}
          </sl-button>
        </sl-dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'project-list': ProjectList;
  }
}
