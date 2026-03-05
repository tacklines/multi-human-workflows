import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({
  breaks: true,
  gfm: true,
});

// Configure DOMPurify to allow safe HTML and add target="_blank" to links
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

@customElement('markdown-content')
export class MarkdownContent extends LitElement {
  @property({ type: String }) content = '';

  static styles = css`
    :host {
      display: block;
      line-height: 1.6;
      color: var(--text-primary, #e2e8f0);
      word-break: break-word;
    }

    .md-body h1, .md-body h2, .md-body h3,
    .md-body h4, .md-body h5, .md-body h6 {
      margin: 0.75em 0 0.25em;
      font-weight: 600;
      line-height: 1.3;
      color: var(--text-primary, #e2e8f0);
    }
    .md-body h1 { font-size: 1.4em; }
    .md-body h2 { font-size: 1.2em; }
    .md-body h3 { font-size: 1.1em; }
    .md-body h4, .md-body h5, .md-body h6 { font-size: 1em; }
    .md-body h1:first-child, .md-body h2:first-child, .md-body h3:first-child {
      margin-top: 0;
    }

    .md-body p {
      margin: 0.5em 0;
    }
    .md-body p:first-child { margin-top: 0; }
    .md-body p:last-child { margin-bottom: 0; }

    .md-body a {
      color: var(--sl-color-primary-400, #60a5fa);
      text-decoration: none;
    }
    .md-body a:hover {
      text-decoration: underline;
    }

    .md-body strong { font-weight: 600; }

    .md-body code {
      background: var(--surface-bg, #1e293b);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-size: 0.9em;
      font-family: 'Fira Code', 'Cascadia Code', monospace;
    }

    .md-body pre {
      background: var(--surface-bg, #1e293b);
      border: 1px solid var(--border-subtle, #334155);
      border-radius: 6px;
      padding: 0.75em 1em;
      overflow-x: auto;
      margin: 0.5em 0;
    }
    .md-body pre code {
      background: none;
      padding: 0;
      font-size: 0.85em;
    }

    .md-body blockquote {
      border-left: 3px solid var(--sl-color-primary-400, #60a5fa);
      margin: 0.5em 0;
      padding: 0.25em 0.75em;
      color: var(--text-secondary, #94a3b8);
    }
    .md-body blockquote p { margin: 0.25em 0; }

    .md-body ul, .md-body ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
    .md-body li { margin: 0.15em 0; }
    .md-body li > ul, .md-body li > ol { margin: 0; }

    .md-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
      font-size: 0.9em;
    }
    .md-body th, .md-body td {
      border: 1px solid var(--border-subtle, #334155);
      padding: 0.4em 0.6em;
      text-align: left;
    }
    .md-body th {
      background: var(--surface-bg, #1e293b);
      font-weight: 600;
    }

    .md-body hr {
      border: none;
      border-top: 1px solid var(--border-subtle, #334155);
      margin: 0.75em 0;
    }

    .md-body img {
      max-width: 100%;
      border-radius: 4px;
    }

    /* @mention highlighting */
    .md-body .mention {
      color: var(--sl-color-primary-400, #60a5fa);
      font-weight: 600;
    }

    /* Task/checkbox lists */
    .md-body input[type="checkbox"] {
      margin-right: 0.4em;
    }
  `;

  render() {
    if (!this.content) return html``;
    return html`<div class="md-body">${unsafeHTML(this._renderMarkdown(this.content))}</div>`;
  }

  private _renderMarkdown(text: string): string {
    // Render markdown to HTML
    let rendered = marked.parse(text) as string;

    // Highlight @mentions in the rendered HTML (outside of tags)
    rendered = rendered.replace(
      /(@[\w.\-]+(?:\s[\w.\-]+)?)/g,
      (match, mention, offset, full) => {
        // Don't replace inside HTML tags or attributes
        const before = full.substring(0, offset);
        const openTags = (before.match(/</g) || []).length;
        const closeTags = (before.match(/>/g) || []).length;
        if (openTags > closeTags) return match; // inside a tag
        return `<span class="mention">${mention}</span>`;
      }
    );

    // Sanitize
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr', 'img', 'span', 'input', 'div',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'src', 'alt', 'title',
        'class', 'type', 'checked', 'disabled',
      ],
    });
  }
}
