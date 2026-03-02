import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

export interface BoundaryNode {
  id: string;
  label: string;
  /** Optional manual x coordinate (px). Auto-computed if omitted. */
  x?: number;
  /** Optional manual y coordinate (px). Auto-computed if omitted. */
  y?: number;
}

export interface BoundaryConnection {
  from: string;
  to: string;
  status: 'pass' | 'fail' | 'warn';
  /** Short edge label shown near the midpoint */
  label?: string;
}

// Layout constants
const NODE_W = 140;
const NODE_H = 44;
const COLS = 3;
const COL_GAP = 160;
const ROW_GAP = 80;
const SVG_PADDING = 32;

const STATUS_COLOR: Record<'pass' | 'fail' | 'warn', string> = {
  pass: '#16a34a',
  fail: '#dc2626',
  warn: '#d97706',
};

interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

function layoutNodes(nodes: BoundaryNode[]): { layoutNodes: LayoutNode[]; svgWidth: number; svgHeight: number } {
  if (nodes.length === 0) {
    return { layoutNodes: [], svgWidth: 0, svgHeight: 0 };
  }

  const result: LayoutNode[] = nodes.map((n, i) => {
    if (n.x !== undefined && n.y !== undefined) {
      return { id: n.id, label: n.label, x: n.x, y: n.y };
    }
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      id: n.id,
      label: n.label,
      x: SVG_PADDING + col * (NODE_W + COL_GAP),
      y: SVG_PADDING + row * (NODE_H + ROW_GAP),
    };
  });

  const numCols = Math.min(nodes.length, COLS);
  const numRows = Math.ceil(nodes.length / COLS);
  const svgWidth = SVG_PADDING * 2 + numCols * NODE_W + (numCols - 1) * COL_GAP;
  const svgHeight = SVG_PADDING * 2 + numRows * NODE_H + (numRows - 1) * ROW_GAP;

  return { layoutNodes: result, svgWidth, svgHeight };
}

/**
 * `<boundary-map>` — SVG boundary map showing how contexts/aggregates connect.
 *
 * Nodes are bounded contexts or aggregates arranged in a simple grid.
 * Edges are colored lines with arrowheads: green (pass), red (fail), amber (warn).
 * Color is never the sole differentiator — edge labels and a screen-reader table
 * also convey the status.
 *
 * @property nodes       - Array of BoundaryNode objects to display
 * @property connections - Array of BoundaryConnection objects (edges)
 */
@customElement('boundary-map')
export class BoundaryMap extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans, system-ui, sans-serif);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .header-title {
      font-size: 1rem;
      font-weight: var(--sl-font-weight-semibold, 600);
      color: var(--sl-color-neutral-800, #1f2937);
      margin: 0;
    }

    .svg-container {
      overflow-x: auto;
      border: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
      background: var(--sl-color-neutral-50, #f9fafb);
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: var(--sl-color-neutral-400, #9ca3af);
      border: 1px dashed var(--sl-color-neutral-200, #e5e7eb);
      border-radius: var(--sl-border-radius-medium, 8px);
    }

    /* ---- Legend ---- */
    .legend {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--sl-color-neutral-600, #4b5563);
      align-items: center;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .legend-swatch {
      width: 18px;
      height: 3px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    /* ---- SR-only table ---- */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;

  /** Nodes to render as bounded context/aggregate boxes */
  @property({ attribute: false }) nodes: BoundaryNode[] = [];

  /** Connections (edges) between nodes */
  @property({ attribute: false }) connections: BoundaryConnection[] = [];

  // ---- Render helpers ----

  private _renderNode(node: LayoutNode) {
    const truncated = node.label.length > 18 ? node.label.slice(0, 17) + '\u2026' : node.label;
    return html`
      <g aria-label="${node.label}" role="img">
        <rect
          x="${node.x}"
          y="${node.y}"
          width="${NODE_W}"
          height="${NODE_H}"
          rx="8"
          fill="white"
          stroke="var(--sl-color-neutral-300, #d1d5db)"
          stroke-width="1.5"
        />
        <text
          x="${node.x + NODE_W / 2}"
          y="${node.y + NODE_H / 2}"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="12"
          font-family="var(--sl-font-sans, system-ui)"
          fill="var(--sl-color-neutral-800, #1f2937)"
          style="pointer-events: none;"
        >${truncated}</text>
      </g>
    `;
  }

  private _renderEdge(
    conn: BoundaryConnection,
    nodeMap: Map<string, LayoutNode>,
    idx: number
  ) {
    const fromNode = nodeMap.get(conn.from);
    const toNode = nodeMap.get(conn.to);
    if (!fromNode || !toNode) return null;

    const color = STATUS_COLOR[conn.status];
    const markerId = `arrow-${conn.status}-${idx}`;

    // Calculate edge endpoints (center of right/left edges)
    const x1 = fromNode.x + NODE_W;
    const y1 = fromNode.y + NODE_H / 2;
    const x2 = toNode.x;
    const y2 = toNode.y + NODE_H / 2;

    // If same column, connect bottom-to-top
    const sameCol = Math.abs(x1 - toNode.x) < 10;
    const mx = sameCol ? x1 : (x1 + x2) / 2;

    let d: string;
    if (sameCol) {
      // Vertical edge: from bottom to top
      const fy = fromNode.y + NODE_H;
      const ty = toNode.y;
      d = `M ${fromNode.x + NODE_W / 2} ${fy} C ${fromNode.x + NODE_W / 2 + 40} ${fy + ROW_GAP / 2}, ${toNode.x + NODE_W / 2 + 40} ${ty - ROW_GAP / 2}, ${toNode.x + NODE_W / 2} ${ty}`;
    } else {
      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    }

    const statusLabel = conn.status === 'pass'
      ? t('boundaryMap.status.pass')
      : conn.status === 'fail'
        ? t('boundaryMap.status.fail')
        : t('boundaryMap.status.warn');

    const edgeAriaLabel = t('boundaryMap.edge.ariaLabel', {
      from: conn.from,
      to: conn.to,
      status: statusLabel,
    });

    return html`
      <defs>
        <marker
          id="${markerId}"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="${color}" />
        </marker>
      </defs>
      <path
        d="${d}"
        fill="none"
        stroke="${color}"
        stroke-width="2"
        marker-end="url(#${markerId})"
        aria-label="${edgeAriaLabel}"
        role="img"
      />
      ${conn.label ? html`
        <text
          x="${sameCol ? fromNode.x + NODE_W / 2 + 48 : mx}"
          y="${sameCol ? (fromNode.y + NODE_H + toNode.y) / 2 : (y1 + y2) / 2 - 6}"
          text-anchor="middle"
          font-size="10"
          font-family="var(--sl-font-sans, system-ui)"
          fill="${color}"
          style="pointer-events: none;"
        >${conn.label}</text>
      ` : null}
    `;
  }

  private _renderSRTable(nodeMap: Map<string, LayoutNode>) {
    if (this.connections.length === 0) return html``;
    return html`
      <table class="sr-only" aria-label="${t('boundaryMap.table.ariaLabel')}">
        <caption>${t('boundaryMap.table.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">${t('boundaryMap.table.col.from')}</th>
            <th scope="col">${t('boundaryMap.table.col.to')}</th>
            <th scope="col">${t('boundaryMap.table.col.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${this.connections.map((conn) => {
            const fromNode = nodeMap.get(conn.from);
            const toNode = nodeMap.get(conn.to);
            const fromLabel = fromNode?.label ?? conn.from;
            const toLabel = toNode?.label ?? conn.to;
            const statusLabel = conn.status === 'pass'
              ? t('boundaryMap.status.pass')
              : conn.status === 'fail'
                ? t('boundaryMap.status.fail')
                : t('boundaryMap.status.warn');
            return html`
              <tr>
                <td>${fromLabel}</td>
                <td>${toLabel}</td>
                <td>${statusLabel}</td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    `;
  }

  override render() {
    if (this.nodes.length === 0) {
      return html`
        <div class="empty">
          <span>${t('boundaryMap.empty')}</span>
        </div>
      `;
    }

    const { layoutNodes: lNodes, svgWidth, svgHeight } = layoutNodes(this.nodes);
    const nodeMap = new Map(lNodes.map((n) => [n.id, n]));

    return html`
      <div>
        <div class="header">
          <h3 class="header-title">${t('boundaryMap.title')}</h3>
        </div>

        <div class="svg-container">
          <svg
            width="${svgWidth}"
            height="${Math.max(svgHeight, 100)}"
            viewBox="0 0 ${svgWidth} ${Math.max(svgHeight, 100)}"
            aria-hidden="true"
            role="img"
          >
            <!-- Edges rendered below nodes -->
            ${this.connections.map((conn, idx) => this._renderEdge(conn, nodeMap, idx))}
            <!-- Nodes -->
            ${lNodes.map((n) => this._renderNode(n))}
          </svg>
        </div>

        <!-- Legend -->
        <div class="legend" aria-label="${t('boundaryMap.legend.ariaLabel')}">
          <span style="font-weight: 600; color: #374151;">${t('boundaryMap.legend.label')}</span>
          <span class="legend-item">
            <span class="legend-swatch" style="background: #16a34a;"></span>
            ${t('boundaryMap.status.pass')}
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style="background: #d97706;"></span>
            ${t('boundaryMap.status.warn')}
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style="background: #dc2626;"></span>
            ${t('boundaryMap.status.fail')}
          </span>
        </div>

        <!-- Screen reader accessible table -->
        ${this._renderSRTable(nodeMap)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'boundary-map': BoundaryMap;
  }
}
