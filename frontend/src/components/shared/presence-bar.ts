import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SessionParticipant } from '../../state/app-state.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';

@customElement('presence-bar')
export class PresenceBar extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    .presence-row {
      display: flex;
      align-items: center;
      gap: 0;
    }

    .avatar-slot {
      position: relative;
      margin-left: -8px;
      z-index: 1;
      transition: transform 0.15s ease, z-index 0s;
    }

    .avatar-slot:first-child {
      margin-left: 0;
    }

    .avatar-slot:hover {
      z-index: 10;
      transform: translateY(-2px);
    }

    @media (prefers-reduced-motion: reduce) {
      .avatar-slot { transition: none; }
      .avatar-slot:hover { transform: none; }
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: rgba(255, 255, 255, 0.9);
      border: 2px solid var(--surface-header);
      cursor: pointer;
      user-select: none;
      position: relative;
      transition: border-color 0.15s ease;
      min-width: 44px;
      min-height: 44px;
      box-sizing: content-box;
      padding: 6px;
      margin: -6px;
    }

    @media (prefers-reduced-motion: reduce) {
      .avatar { transition: none; }
    }

    .avatar-inner {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--avatar-bg, var(--avatar-bg-default));
      position: relative;
    }

    .avatar.is-you .avatar-inner {
      box-shadow: 0 0 0 2px var(--sl-color-primary-500);
    }

    .avatar.is-agent .avatar-inner {
      background: var(--avatar-agent-gradient);
    }

    .status-dot {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--surface-header);
      background: var(--avatar-status-online);
    }

    .status-dot.agent {
      background: var(--sl-color-primary-500);
    }

    .agent-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      font-size: 10px;
      line-height: 1;
      filter: drop-shadow(0 0 2px rgba(99, 102, 241, 0.5));
    }

    .overflow {
      margin-left: -8px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--avatar-overflow-bg);
      border: 2px solid var(--surface-header);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      z-index: 0;
      min-width: 44px;
      min-height: 44px;
      box-sizing: content-box;
      padding: 6px;
      margin-top: -6px;
      margin-bottom: -6px;
      margin-right: -6px;
    }

    @media (max-width: 640px) {
      .avatar-inner { width: 28px; height: 28px; }
      .avatar-slot { margin-left: -6px; }
    }
  `;

  @property({ type: Array }) participants: SessionParticipant[] = [];
  @property({ attribute: 'current-id' }) currentId = '';
  @property({ type: Number, attribute: 'max-visible' }) maxVisible = 5;

  private _avatarColors = [
    '#4f46e5', '#7c3aed', '#2563eb', '#0891b2', '#059669',
    '#d97706', '#dc2626', '#be185d',
  ];

  private _getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  private _getColor(index: number): string {
    return this._avatarColors[index % this._avatarColors.length];
  }

  private _onClick(id: string) {
    this.dispatchEvent(new CustomEvent('participant-clicked', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
  }

  private _onRemove(p: SessionParticipant) {
    this.dispatchEvent(new CustomEvent('participant-remove-requested', {
      detail: { id: p.id, name: p.display_name, type: p.participant_type },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (this.participants.length === 0) return nothing;

    const visible = this.participants.slice(0, this.maxVisible);
    const overflow = this.participants.length - this.maxVisible;

    return html`
      <div class="presence-row" role="list" aria-label="Session participants">
        ${visible.map((p, i) => {
          const isYou = p.id === this.currentId;
          const isAgent = p.participant_type === 'agent';
          const initials = this._getInitials(p.display_name);
          const bgColor = this._getColor(i);
          const sponsor = isAgent && p.sponsor_id
            ? this.participants.find((s) => s.id === p.sponsor_id)
            : null;
          const tooltipContent = `${p.display_name}${isYou ? ' (you)' : ''} · ${isAgent ? 'AI Agent' : 'Participant'}${sponsor ? ` · Agent of ${sponsor.display_name}` : ''}`;

          const avatarButton = html`
            <button
              class="avatar ${isYou ? 'is-you' : ''} ${isAgent ? 'is-agent' : ''}"
              @click=${() => this._onClick(p.id)}
              aria-label="${p.display_name}${isYou ? ' (you)' : ''}${isAgent ? ' (AI agent)' : ''}"
            >
              <div class="avatar-inner" style="background: ${isAgent ? '' : bgColor}">
                ${initials}
                <span class="status-dot ${isAgent ? 'agent' : ''}" aria-hidden="true"></span>
                ${isAgent ? html`<span class="agent-badge" aria-hidden="true">&#10024;</span>` : nothing}
              </div>
            </button>
          `;

          return html`
            <div class="avatar-slot" role="listitem">
              ${isYou
                ? html`<sl-tooltip content="${tooltipContent}" placement="bottom">${avatarButton}</sl-tooltip>`
                : html`
                  <sl-dropdown>
                    <sl-tooltip content="${tooltipContent}" placement="bottom" slot="trigger">
                      ${avatarButton}
                    </sl-tooltip>
                    <sl-menu @sl-select=${() => this._onRemove(p)}>
                      <sl-menu-item>Remove from session</sl-menu-item>
                    </sl-menu>
                  </sl-dropdown>
                `}
            </div>
          `;
        })}
        ${overflow > 0 ? html`
          <button
            class="overflow"
            aria-label="${overflow} more participants"
            @click=${() => this._onClick('overflow')}
          >+${overflow}</button>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'presence-bar': PresenceBar;
  }
}
