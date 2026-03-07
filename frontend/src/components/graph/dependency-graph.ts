import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  fetchDependencyGraph,
  type DependencyGraphView,
} from "../../state/task-api.js";
import type { TaskView, TaskStatus, TaskType } from "../../state/task-types.js";
import {
  STATUS_LABELS,
  TASK_TYPE_LABELS,
  PRIORITY_LABELS,
} from "../../state/task-types.js";
import { t } from "../../lib/i18n.js";
import {
  CARD_W,
  DIM_OPACITY,
  STATUS_COLORS,
  STATUS_HEX,
  PRIORITY_HEX,
  type GraphNode,
  type GraphLink,
} from "../../lib/graph-constants.js";
import { renderCardToTexture } from "../../lib/graph-card-renderer.js";
import { simulateForces, updateLinkGeometry } from "../../lib/graph-physics.js";

@customElement("dependency-graph")
export class DependencyGraph extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: #06060b;
    }

    canvas {
      display: block;
    }

    /* ── Filter bar ── */
    .filter-bar {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(6, 6, 11, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 6px 10px;
      z-index: 10;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .filter-sep {
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.08);
      margin: 0 4px;
    }

    .filter-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.7rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      font-family: inherit;
    }

    .filter-pill:hover {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.7);
    }

    .filter-pill.active {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.9);
    }

    .filter-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .filter-count {
      font-size: 0.6rem;
      opacity: 0.5;
      font-family: var(--sl-font-mono, monospace);
    }

    /* ── Search ── */
    .search-box {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 10;
    }

    .search-input {
      background: rgba(6, 6, 11, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 6px 12px 6px 32px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.75rem;
      width: 180px;
      outline: none;
      transition:
        border-color 0.15s,
        width 0.2s;
      font-family: inherit;
    }

    .search-input:focus {
      border-color: rgba(59, 130, 246, 0.5);
      width: 240px;
    }

    .search-input::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: rgba(255, 255, 255, 0.25);
      font-size: 0.8rem;
      pointer-events: none;
    }

    /* ── Nav controls ── */
    .nav-controls {
      position: absolute;
      bottom: 16px;
      left: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 10;
    }

    .nav-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(6, 6, 11, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      transition: all 0.15s;
      font-size: 0.85rem;
      font-family: inherit;
    }

    .nav-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .nav-btn.active {
      background: rgba(59, 130, 246, 0.15);
      border-color: rgba(59, 130, 246, 0.3);
      color: rgba(59, 130, 246, 0.9);
    }

    .view-toggle {
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      font-family: var(--sl-font-mono, monospace);
    }

    /* ── Detail panel ── */
    .detail-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 320px;
      background: rgba(6, 6, 11, 0.92);
      backdrop-filter: blur(24px);
      border-left: 1px solid rgba(255, 255, 255, 0.06);
      padding: 20px;
      z-index: 20;
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      color: rgba(255, 255, 255, 0.8);
    }

    .detail-panel.open {
      transform: translateX(0);
    }

    .detail-close {
      position: absolute;
      top: 12px;
      right: 12px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      font-size: 1rem;
      padding: 4px;
      font-family: inherit;
    }

    .detail-close:hover {
      color: rgba(255, 255, 255, 0.8);
    }

    .detail-ticket {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.4);
      margin-bottom: 4px;
    }

    .detail-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 16px;
      line-height: 1.3;
    }

    .detail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }

    .detail-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .detail-badge .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .detail-section-title {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.35);
      margin-top: 16px;
      margin-bottom: 8px;
    }

    .detail-dep-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .detail-dep-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.1s;
    }

    .detail-dep-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .detail-dep-ticket {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.4);
      flex-shrink: 0;
    }

    .detail-dep-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-description {
      font-size: 0.8rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.6);
      white-space: pre-wrap;
    }

    /* ── Tooltip ── */
    .tooltip {
      position: absolute;
      background: rgba(6, 6, 11, 0.92);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.9);
      pointer-events: none;
      transform: translate(-50%, -100%);
      margin-top: -14px;
      white-space: nowrap;
      z-index: 15;
      opacity: 0;
      transition: opacity 0.12s;
    }

    .tooltip.visible {
      opacity: 1;
    }

    .tooltip .tt-ticket {
      font-family: var(--sl-font-mono, monospace);
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.4);
    }

    .tooltip .tt-title {
      font-weight: 500;
      margin-top: 2px;
    }

    /* ── Legend ── */
    .legend {
      position: absolute;
      bottom: 16px;
      right: 16px;
      background: rgba(6, 6, 11, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      display: flex;
      flex-direction: column;
      gap: 3px;
      z-index: 10;
      transition: opacity 0.2s;
    }

    .legend:hover {
      opacity: 0.4;
    }

    .legend-title {
      font-weight: 600;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 1px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Keyboard hint ── */
    .kb-hint {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.6rem;
      color: rgba(255, 255, 255, 0.15);
      pointer-events: none;
      z-index: 5;
      white-space: nowrap;
    }

    kbd {
      display: inline-block;
      padding: 1px 4px;
      font-size: 0.6rem;
      font-family: var(--sl-font-mono, monospace);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.03);
    }

    /* ── Loading/empty ── */
    .loading-overlay,
    .empty-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #06060b;
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.9rem;
      gap: 0.5rem;
    }

    /* ── Stats bar ── */
    .stats-bar {
      position: absolute;
      top: 16px;
      left: 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.25);
      font-family: var(--sl-font-mono, monospace);
      z-index: 10;
      pointer-events: none;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";

  @state() private _loading = true;
  @state() private _empty = false;
  @state() private _tooltipVisible = false;
  @state() private _tooltipX = 0;
  @state() private _tooltipY = 0;
  @state() private _tooltipTask: TaskView | null = null;
  @state() private _selectedNode: GraphNode | null = null;
  @state() private _searchQuery = "";
  @state() private _is2D = true;

  // Filter state — all active by default
  @state() private _statusFilters = new Set<TaskStatus>([
    "open",
    "in_progress",
    "done",
    "closed",
  ]);
  @state() private _typeFilters = new Set<TaskType>([
    "epic",
    "story",
    "task",
    "subtask",
    "bug",
  ]);

  private _scene!: THREE.Scene;
  private _perspCamera!: THREE.PerspectiveCamera;
  private _orthoCamera!: THREE.OrthographicCamera;
  private _camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private _renderer!: THREE.WebGLRenderer;
  private _composer!: EffectComposer;
  private _controls!: OrbitControls;
  private _graphGroup!: THREE.Group;
  private _nodes: GraphNode[] = [];
  private _links: GraphLink[] = [];
  private _allData: DependencyGraphView | null = null;
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _hoveredNode: GraphNode | null = null;
  private _animationId = 0;
  private _clock = new THREE.Clock();
  private _resizeObserver: ResizeObserver | null = null;
  private _cameraTarget = new THREE.Vector3();
  private _cameraTargetDist = 160;
  private _animatingCamera = false;

  // Counts for filter pills
  private _statusCounts: Record<string, number> = {};
  private _typeCounts: Record<string, number> = {};

  async connectedCallback() {
    super.connectedCallback();
    await this.updateComplete;
    this._boundKeyHandler = this._onKeyDown.bind(this);
    window.addEventListener("keydown", this._boundKeyHandler);
    await this._loadAndRender();
  }

  private _boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._animationId) cancelAnimationFrame(this._animationId);
    this._resizeObserver?.disconnect();
    this._renderer?.dispose();
    this._composer?.dispose();
    if (this._boundKeyHandler) {
      window.removeEventListener("keydown", this._boundKeyHandler);
    }
  }

  private _onKeyDown(e: KeyboardEvent) {
    // "/" to focus search
    if (e.key === "/" && !this._isInputFocused()) {
      e.preventDefault();
      const input = this.renderRoot.querySelector(
        ".search-input",
      ) as HTMLInputElement;
      input?.focus();
    }
    // Escape to deselect or blur
    if (e.key === "Escape") {
      if (this._selectedNode) {
        this._deselectNode();
      } else {
        const input = this.renderRoot.querySelector(
          ".search-input",
        ) as HTMLInputElement;
        if (input && (this.renderRoot as ShadowRoot).activeElement === input) {
          input.blur();
          this._searchQuery = "";
          this._applySearchHighlight();
        }
      }
    }
    // "f" to zoom to fit
    if (e.key === "f" && !this._isInputFocused()) {
      this._zoomToFit();
    }
    // "r" to reset
    if (e.key === "r" && !this._isInputFocused()) {
      this._resetView();
    }
    // "v" to toggle 2D/3D
    if (e.key === "v" && !this._isInputFocused()) {
      this._toggleViewMode();
    }
  }

  private _isInputFocused(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    // Walk into shadow roots to find the deepest active element
    let el: Element | null = active;
    while (el?.shadowRoot?.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    const tag = el?.tagName?.toLowerCase() ?? "";
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "sl-input" ||
      tag === "sl-textarea" ||
      tag === "sl-select" ||
      tag === "sl-combobox" ||
      (el as HTMLElement)?.isContentEditable === true
    );
  }

  private async _loadAndRender() {
    try {
      const data = await fetchDependencyGraph(this.projectId);
      this._allData = data;
      this._loading = false;

      if (data.tasks.length === 0) {
        this._empty = true;
        return;
      }

      // Compute counts
      this._statusCounts = {};
      this._typeCounts = {};
      for (const task of data.tasks) {
        this._statusCounts[task.status] =
          (this._statusCounts[task.status] ?? 0) + 1;
        this._typeCounts[task.task_type] =
          (this._typeCounts[task.task_type] ?? 0) + 1;
      }

      await this.updateComplete;

      // Wait for the container to have non-zero dimensions (layout may not be ready on hard refresh)
      const container = this.renderRoot.querySelector(
        ".graph-container",
      ) as HTMLDivElement;
      if (
        !container ||
        container.clientWidth === 0 ||
        container.clientHeight === 0
      ) {
        await new Promise<void>((resolve) => {
          const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                ro.disconnect();
                resolve();
                return;
              }
            }
          });
          if (container) {
            ro.observe(container);
          } else {
            // Container not in DOM yet — poll briefly
            const interval = setInterval(() => {
              const el = this.renderRoot.querySelector(
                ".graph-container",
              ) as HTMLDivElement;
              if (el && el.clientWidth > 0 && el.clientHeight > 0) {
                clearInterval(interval);
                resolve();
              }
            }, 50);
            setTimeout(() => {
              clearInterval(interval);
              resolve();
            }, 3000);
          }
        });
      }

      this._initThree();
      this._buildGraph(data);
      this._zoomToFit();
      this._animate();
    } catch (err) {
      console.error("Failed to load dependency graph:", err);
      this._loading = false;
      this._empty = true;
    }
  }

  private _initThree() {
    const container = this.renderRoot.querySelector(
      ".graph-container",
    ) as HTMLDivElement;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    this._scene = new THREE.Scene();
    this._graphGroup = new THREE.Group();
    this._scene.add(this._graphGroup);

    // Perspective camera (3D mode)
    this._perspCamera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    this._perspCamera.position.set(0, 10, 180);

    // Orthographic camera (2D mode)
    const aspect = w / h;
    const frustumSize = 160;
    this._orthoCamera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      2000,
    );
    this._orthoCamera.position.set(0, 0, 500);
    this._orthoCamera.zoom = 0.01;

    // Default to 2D
    this._camera = this._is2D ? this._orthoCamera : this._perspCamera;

    this._renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.2;
    container.appendChild(this._renderer.domElement);

    // Post-processing: bloom
    this._composer = new EffectComposer(this._renderer);
    this._composer.addPass(new RenderPass(this._scene, this._camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.3, // strength
      0.2, // radius
      0.92, // threshold — only brightest elements (particles, glows)
    );
    this._composer.addPass(bloom);

    // Controls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.06;
    this._controls.zoomSpeed = 1.2;
    this._applyViewModeControls();

    // Lighting
    this._scene.add(new THREE.AmbientLight(0x303050, 0.6));

    const light1 = new THREE.PointLight(0x3b82f6, 3, 300);
    light1.position.set(60, 60, 60);
    this._scene.add(light1);

    const light2 = new THREE.PointLight(0x8b5cf6, 2, 300);
    light2.position.set(-60, -40, -60);
    this._scene.add(light2);

    const light3 = new THREE.PointLight(0x22c55e, 1, 200);
    light3.position.set(0, 80, -40);
    this._scene.add(light3);

    this._addStarfield();
    this._addGridPlane();

    // Resize
    this._resizeObserver = new ResizeObserver(() => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      const rAspect = rw / rh;

      this._perspCamera.aspect = rAspect;
      this._perspCamera.updateProjectionMatrix();

      const fs = 160;
      this._orthoCamera.left = (-fs * rAspect) / 2;
      this._orthoCamera.right = (fs * rAspect) / 2;
      this._orthoCamera.top = fs / 2;
      this._orthoCamera.bottom = -fs / 2;
      this._orthoCamera.updateProjectionMatrix();

      this._renderer.setSize(rw, rh);
      this._composer.setSize(rw, rh);
    });
    this._resizeObserver.observe(container);

    // Mouse events
    container.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._tooltipX = e.clientX - rect.left;
      this._tooltipY = e.clientY - rect.top;
    });

    container.addEventListener("mouseleave", () => {
      this._tooltipVisible = false;
      if (this._hoveredNode && !this._hoveredNode.selected) {
        this._setNodeHover(this._hoveredNode, false);
      }
      this._hoveredNode = null;
    });

    container.addEventListener("click", (e) => {
      // Ignore if dragging
      if (e.detail === 0) return;
      this._raycaster.setFromCamera(this._mouse, this._camera);
      const meshes = this._nodes.filter((n) => n.visible).map((n) => n.mesh);
      const intersects = this._raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh & {
          __graphNode?: GraphNode;
        };
        if (mesh.__graphNode) {
          this._selectNode(mesh.__graphNode);
        }
      } else {
        this._deselectNode();
      }
    });
  }

  private _addStarfield() {
    const geo = new THREE.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.25,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    });
    this._scene.add(new THREE.Points(geo, mat));
  }

  private _addGridPlane() {
    const gridGeo = new THREE.BufferGeometry();
    const gridLines = 40;
    const gridSize = 200;
    const positions: number[] = [];
    for (let i = -gridLines; i <= gridLines; i++) {
      const pos = (i / gridLines) * gridSize;
      positions.push(-gridSize, -60, pos, gridSize, -60, pos);
      positions.push(pos, -60, -gridSize, pos, -60, gridSize);
    }
    gridGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.3,
    });
    this._scene.add(new THREE.LineSegments(gridGeo, gridMat));
  }

  private _buildGraph(data: DependencyGraphView) {
    const taskMap = new Map<string, GraphNode>();

    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      const theta = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 40;
      const position = this._is2D
        ? new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), 0)
        : new THREE.Vector3(
            r * Math.sin(Math.acos(2 * Math.random() - 1)) * Math.cos(theta),
            r * Math.sin(Math.acos(2 * Math.random() - 1)) * Math.sin(theta),
            r * (2 * Math.random() - 1),
          );

      const color = new THREE.Color(STATUS_COLORS[task.status]);

      // Card node (uses extracted card renderer)
      const { mesh } = renderCardToTexture(task, color);
      mesh.position.copy(position);
      this._graphGroup.add(mesh);

      // Selection ring
      const ringGeo = new THREE.RingGeometry(CARD_W * 0.58, CARD_W * 0.62, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(position);
      this._graphGroup.add(ring);

      const node: GraphNode = {
        task,
        position,
        velocity: new THREE.Vector3(),
        mesh,
        ring,
        pinned: false,
        visible: true,
        selected: false,
        dimmed: false,
      };

      (mesh as THREE.Mesh & { __graphNode?: GraphNode }).__graphNode = node;
      taskMap.set(task.id, node);
      this._nodes.push(node);
    }

    // Dependency links
    for (const edge of data.edges) {
      const source = taskMap.get(edge.blocker_id);
      const target = taskMap.get(edge.blocked_id);
      if (!source || !target) continue;

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        source.position,
        target.position,
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x4a5568,
        transparent: true,
        opacity: 0.5,
        linewidth: 2,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this._graphGroup.add(line);

      const arrowGeo = new THREE.ConeGeometry(1.5, 3.5, 6);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.6,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      this._graphGroup.add(arrow);

      const pCount = 5;
      const pPos = new Float32Array(pCount * 3);
      const pProgress = new Float32Array(pCount);
      for (let i = 0; i < pCount; i++) pProgress[i] = i / pCount;

      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0x8b5cf6,
        size: 1.2,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(pGeo, pMat);
      this._graphGroup.add(particles);

      this._links.push({
        source,
        target,
        line,
        arrow,
        particles,
        particleProgress: pProgress,
        visible: true,
      });
    }

    // Provenance edges (dashed, purple)
    for (const prov of data.provenance ?? []) {
      const source = taskMap.get(prov.source_id);
      const target = taskMap.get(prov.derived_id);
      if (!source || !target) continue;

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        source.position,
        target.position,
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.5,
        dashSize: 2,
        gapSize: 1.5,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      this._graphGroup.add(line);

      const arrowGeo = new THREE.ConeGeometry(1.2, 2.8, 6);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.5,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      this._graphGroup.add(arrow);

      const pCount = 3;
      const pPos = new Float32Array(pCount * 3);
      const pProgress = new Float32Array(pCount);
      for (let i = 0; i < pCount; i++) pProgress[i] = i / pCount;
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0xc084fc,
        size: 0.9,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(pGeo, pMat);
      this._graphGroup.add(particles);

      this._links.push({
        source,
        target,
        line,
        arrow,
        particles,
        particleProgress: pProgress,
        visible: true,
      });
    }
  }

  // ─── Filtering ───

  private _toggleStatusFilter(status: TaskStatus) {
    const next = new Set(this._statusFilters);
    if (next.has(status)) {
      if (next.size > 1) next.delete(status);
    } else {
      next.add(status);
    }
    this._statusFilters = next;
    this._applyFilters();
  }

  private _toggleTypeFilter(type: TaskType) {
    const next = new Set(this._typeFilters);
    if (next.has(type)) {
      if (next.size > 1) next.delete(type);
    } else {
      next.add(type);
    }
    this._typeFilters = next;
    this._applyFilters();
  }

  private _applyFilters() {
    for (const node of this._nodes) {
      const matchStatus = this._statusFilters.has(node.task.status);
      const matchType = this._typeFilters.has(node.task.task_type);
      node.visible = matchStatus && matchType;
      node.mesh.visible = node.visible;
      node.ring.visible = node.visible && node.selected;
    }

    for (const link of this._links) {
      link.visible = link.source.visible && link.target.visible;
      link.line.visible = link.visible;
      link.arrow.visible = link.visible;
      link.particles.visible = link.visible;
    }

    // Deselect if filtered out
    if (this._selectedNode && !this._selectedNode.visible) {
      this._deselectNode();
    }
  }

  // ─── Search ───

  private _onSearchInput(e: Event) {
    this._searchQuery = (e.target as HTMLInputElement).value;
    this._applySearchHighlight();
  }

  private _applySearchHighlight() {
    const q = this._searchQuery.toLowerCase().trim();
    if (!q) {
      for (const node of this._nodes) {
        if (node.visible) this._setNodeDim(node, false);
      }
      for (const link of this._links) {
        if (link.visible) {
          (link.line.material as THREE.LineBasicMaterial).opacity = 0.35;
          (link.arrow.material as THREE.MeshBasicMaterial).opacity = 0.6;
        }
      }
      return;
    }

    let firstMatch: GraphNode | null = null;
    for (const node of this._nodes) {
      if (!node.visible) continue;
      const matches =
        node.task.ticket_id.toLowerCase().includes(q) ||
        node.task.title.toLowerCase().includes(q);
      this._setNodeDim(node, !matches);
      if (matches && !firstMatch) firstMatch = node;
    }

    for (const link of this._links) {
      if (!link.visible) continue;
      const dim = link.source.dimmed || link.target.dimmed;
      (link.line.material as THREE.LineBasicMaterial).opacity = dim
        ? 0.05
        : 0.35;
      (link.arrow.material as THREE.MeshBasicMaterial).opacity = dim
        ? 0.05
        : 0.6;
    }

    // Auto-focus first match
    if (firstMatch && q.length >= 2) {
      this._flyToNode(firstMatch);
    }
  }

  // ─── Selection ───

  private _selectNode(node: GraphNode) {
    if (this._selectedNode === node) return;
    this._deselectNode();

    this._selectedNode = node;
    node.selected = true;

    const connected = this._getConnectedNodes(node);
    connected.add(node);

    for (const n of this._nodes) {
      if (!n.visible) continue;
      const isConnected = connected.has(n);
      this._setNodeDim(n, !isConnected);
      if (n === node) {
        n.mesh.scale.setScalar(1.05);
        n.ring.visible = true;
        (n.ring.material as THREE.MeshBasicMaterial).opacity = 0.5;
      }
    }

    for (const link of this._links) {
      if (!link.visible) continue;
      const isConnected =
        connected.has(link.source) && connected.has(link.target);
      (link.line.material as THREE.LineBasicMaterial).opacity = isConnected
        ? 0.6
        : 0.04;
      (link.arrow.material as THREE.MeshBasicMaterial).opacity = isConnected
        ? 0.8
        : 0.04;
      (link.particles.material as THREE.PointsMaterial).opacity = isConnected
        ? 0.9
        : 0.05;
    }

    this.requestUpdate();
  }

  private _deselectNode() {
    if (!this._selectedNode) return;
    this._selectedNode.selected = false;
    this._selectedNode.ring.visible = false;
    this._selectedNode = null;

    for (const node of this._nodes) {
      if (!node.visible) continue;
      this._setNodeDim(node, false);
    }
    for (const link of this._links) {
      if (!link.visible) continue;
      (link.line.material as THREE.LineBasicMaterial).opacity = 0.35;
      (link.arrow.material as THREE.MeshBasicMaterial).opacity = 0.6;
      (link.particles.material as THREE.PointsMaterial).opacity = 0.7;
    }
    this.requestUpdate();
  }

  private _getConnectedNodes(node: GraphNode): Set<GraphNode> {
    const connected = new Set<GraphNode>();
    for (const link of this._links) {
      if (link.source === node) connected.add(link.target);
      if (link.target === node) connected.add(link.source);
    }
    return connected;
  }

  private _selectNodeById(id: string) {
    const node = this._nodes.find((n) => n.task.id === id);
    if (node && node.visible) {
      this._selectNode(node);
    }
  }

  private _getNodeBlockedBy(node: GraphNode): GraphNode[] {
    return this._links.filter((l) => l.target === node).map((l) => l.source);
  }

  private _getNodeBlocks(node: GraphNode): GraphNode[] {
    return this._links.filter((l) => l.source === node).map((l) => l.target);
  }

  // ─── Visual helpers ───

  private _setNodeHover(node: GraphNode, hover: boolean) {
    node.mesh.scale.setScalar(hover ? 1.08 : 1);
  }

  private _setNodeDim(node: GraphNode, dim: boolean) {
    node.dimmed = dim;
    const mat = node.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = dim ? DIM_OPACITY : 1;
  }

  // ─── Camera ───

  private _flyToNode(node: GraphNode) {
    this._cameraTarget.copy(node.position);
    if (this._is2D) this._cameraTarget.z = 0;
    this._cameraTargetDist = 80;
    this._animatingCamera = true;
  }

  private _zoomToFit() {
    const visibleNodes = this._nodes.filter((n) => n.visible);
    if (visibleNodes.length === 0) return;

    const center = new THREE.Vector3();
    for (const n of visibleNodes) center.add(n.position);
    center.divideScalar(visibleNodes.length);

    let maxDist = 0;
    for (const n of visibleNodes) {
      maxDist = Math.max(maxDist, center.distanceTo(n.position));
    }

    this._cameraTarget.copy(center);
    this._cameraTargetDist = Math.max(maxDist * 5, 120);
    this._animatingCamera = true;
  }

  private _resetView() {
    this._deselectNode();
    this._searchQuery = "";
    this._applySearchHighlight();
    this._statusFilters = new Set(["open", "in_progress", "done", "closed"]);
    this._typeFilters = new Set(["epic", "story", "task", "subtask", "bug"]);
    this._applyFilters();
    this._cameraTarget.set(0, 0, 0);
    this._cameraTargetDist = 160;
    this._animatingCamera = true;
    if (this._is2D) {
      this._orthoCamera.zoom = 1;
      this._orthoCamera.updateProjectionMatrix();
    }
  }

  // ─── View mode ───

  private _applyViewModeControls() {
    if (this._is2D) {
      this._controls.enableRotate = false;
      this._controls.maxDistance = 500;
      this._controls.minDistance = 5;
      this._controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      this._controls.enableRotate = true;
      this._controls.maxDistance = 250;
      this._controls.minDistance = 8;
      this._controls.rotateSpeed = 0.6;
      this._controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }

  private _toggleViewMode() {
    this._is2D = !this._is2D;

    const prevTarget = this._controls.target.clone();
    this._camera = this._is2D ? this._orthoCamera : this._perspCamera;

    // Update composer render pass to use new camera
    this._composer.passes[0] = new RenderPass(this._scene, this._camera);

    // Transfer orbit target
    this._controls.dispose();
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.06;
    this._controls.zoomSpeed = 1.2;
    this._controls.target.copy(prevTarget);
    this._applyViewModeControls();

    if (this._is2D) {
      this._orthoCamera.position.set(prevTarget.x, prevTarget.y, 500);
      this._orthoCamera.zoom = 1;
      this._orthoCamera.updateProjectionMatrix();
    } else {
      this._perspCamera.position.set(
        prevTarget.x,
        prevTarget.y + 10,
        prevTarget.z + 180,
      );
    }
  }

  // ─── Animation loop ───

  private _animate() {
    this._animationId = requestAnimationFrame(() => this._animate());
    const dt = Math.min(this._clock.getDelta(), 0.05);

    // Physics step
    simulateForces(this._nodes, this._links, dt, this._is2D);

    // Sync mesh positions and camera-facing orientation
    for (const node of this._nodes) {
      if (!node.visible || node.pinned) continue;
      node.mesh.position.copy(node.position);
      node.ring.position.copy(node.position);
      node.ring.lookAt(this._camera.position);
      if (!this._is2D) {
        node.mesh.lookAt(this._camera.position);
      }
    }

    // Update link geometry
    updateLinkGeometry(this._links, dt);

    this._updateCamera(dt);
    this._updateHover();
    this._controls.update();
    this._composer.render();
  }

  private _updateCamera(dt: number) {
    if (!this._animatingCamera) return;

    const lerpSpeed = 3 * dt;
    this._controls.target.lerp(this._cameraTarget, lerpSpeed);

    if (this._is2D) {
      const targetPos = new THREE.Vector3(
        this._cameraTarget.x,
        this._cameraTarget.y,
        500,
      );
      this._camera.position.lerp(targetPos, lerpSpeed);

      const targetZoom = 160 / Math.max(this._cameraTargetDist, 10);
      this._orthoCamera.zoom +=
        (targetZoom - this._orthoCamera.zoom) * lerpSpeed;
      this._orthoCamera.updateProjectionMatrix();

      if (
        Math.abs(this._orthoCamera.zoom - targetZoom) < 0.01 &&
        this._camera.position.distanceTo(targetPos) < 0.5
      ) {
        this._animatingCamera = false;
      }
    } else {
      const dir = new THREE.Vector3()
        .subVectors(this._camera.position, this._controls.target)
        .normalize();
      const targetPos = new THREE.Vector3()
        .copy(this._controls.target)
        .addScaledVector(dir, this._cameraTargetDist);
      this._camera.position.lerp(targetPos, lerpSpeed);

      if (this._camera.position.distanceTo(targetPos) < 0.5) {
        this._animatingCamera = false;
      }
    }
  }

  private _updateHover() {
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const meshes = this._nodes.filter((n) => n.visible).map((n) => n.mesh);
    const intersects = this._raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh & {
        __graphNode?: GraphNode;
      };
      const node = mesh.__graphNode;
      if (node && node !== this._hoveredNode) {
        if (this._hoveredNode && !this._hoveredNode.selected) {
          this._setNodeHover(this._hoveredNode, false);
        }
        this._hoveredNode = node;
        if (!node.dimmed) {
          this._setNodeHover(node, true);
          this._tooltipTask = node.task;
          this._tooltipVisible = true;
        }
      }
    } else {
      if (this._hoveredNode) {
        if (!this._hoveredNode.selected) {
          this._setNodeHover(this._hoveredNode, false);
        }
        this._hoveredNode = null;
        this._tooltipVisible = false;
      }
    }
  }

  // ─── Render ───

  render() {
    if (this._loading) {
      return html`
        <div class="loading-overlay">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
        </div>
      `;
    }

    if (this._empty) {
      return html`
        <div class="empty-overlay">
          <sl-icon
            name="diagram-3"
            style="font-size: 3rem; opacity: 0.2;"
          ></sl-icon>
          <span>No tasks yet</span>
          <span style="font-size: 0.75rem; opacity: 0.5;"
            >Create tasks and dependencies to see the graph.</span
          >
        </div>
      `;
    }

    const selected = this._selectedNode;

    return html`
      <div class="graph-container" style="width: 100%; height: 100%;"></div>

      ${this._renderFilterBar()} ${this._renderSearch()}
      ${this._renderNavControls()} ${this._renderDetailPanel(selected)}
      ${this._renderTooltip()} ${this._renderLegend()} ${this._renderStats()}

      <div class="kb-hint">
        <kbd>/</kbd> search &nbsp; <kbd>f</kbd> fit &nbsp; <kbd>r</kbd> reset
        &nbsp; <kbd>v</kbd> ${this._is2D ? "3D" : "2D"} &nbsp;
        <kbd>esc</kbd> deselect
      </div>
    `;
  }

  private _renderFilterBar() {
    const statuses: TaskStatus[] = ["open", "in_progress", "done", "closed"];
    const types: TaskType[] = ["epic", "story", "task", "subtask", "bug"];

    return html`
      <div class="filter-bar">
        <div class="filter-group">
          ${statuses.map(
            (s) => html`
              <button
                class="filter-pill ${this._statusFilters.has(s)
                  ? "active"
                  : ""}"
                @click=${() => this._toggleStatusFilter(s)}
              >
                <span
                  class="filter-dot"
                  style="background: ${STATUS_HEX[s]};"
                ></span>
                ${STATUS_LABELS[s]}
                <span class="filter-count">${this._statusCounts[s] ?? 0}</span>
              </button>
            `,
          )}
        </div>
        <div class="filter-sep"></div>
        <div class="filter-group">
          ${types.map(
            (type) => html`
              <button
                class="filter-pill ${this._typeFilters.has(type)
                  ? "active"
                  : ""}"
                @click=${() => this._toggleTypeFilter(type)}
              >
                ${TASK_TYPE_LABELS[type]}
                <span class="filter-count">${this._typeCounts[type] ?? 0}</span>
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  private _renderSearch() {
    return html`
      <div class="search-box">
        <sl-icon name="search" class="search-icon"></sl-icon>
        <input
          class="search-input"
          type="text"
          placeholder=${t("graph.searchPlaceholder")}
          .value=${this._searchQuery}
          @input=${this._onSearchInput}
        />
      </div>
    `;
  }

  private _renderNavControls() {
    return html`
      <div class="nav-controls">
        <button
          class="nav-btn view-toggle ${this._is2D ? "" : "active"}"
          @click=${() => this._toggleViewMode()}
          title=${t("graph.toggle2d3d")}
        >
          ${this._is2D ? "3D" : "2D"}
        </button>
        <button
          class="nav-btn"
          @click=${() => this._zoomToFit()}
          title=${t("graph.zoomToFit")}
        >
          <sl-icon name="fullscreen"></sl-icon>
        </button>
        <button
          class="nav-btn"
          @click=${() => this._resetView()}
          title=${t("graph.resetView")}
        >
          <sl-icon name="arrow-counterclockwise"></sl-icon>
        </button>
      </div>
    `;
  }

  private _renderDetailPanel(selected: GraphNode | null) {
    if (!selected) return html`<div class="detail-panel"></div>`;

    const task = selected.task;
    const blockedBy = this._getNodeBlockedBy(selected);
    const blocks = this._getNodeBlocks(selected);

    return html`
      <div class="detail-panel open">
        <button class="detail-close" @click=${() => this._deselectNode()}>
          <sl-icon name="x-lg"></sl-icon>
        </button>

        <div class="detail-ticket">
          ${task.ticket_id} &middot; ${TASK_TYPE_LABELS[task.task_type]}
        </div>
        <div class="detail-title">${task.title}</div>

        <div class="detail-meta">
          <span class="detail-badge">
            <span
              class="badge-dot"
              style="background: ${STATUS_HEX[task.status]};"
            ></span>
            ${STATUS_LABELS[task.status]}
          </span>
          <span class="detail-badge">
            <span
              class="badge-dot"
              style="background: ${PRIORITY_HEX[task.priority]};"
            ></span>
            ${PRIORITY_LABELS[task.priority]}
          </span>
        </div>

        ${task.description
          ? html`
              <div class="detail-section-title">${t("graph.description")}</div>
              <div class="detail-description">${task.description}</div>
            `
          : nothing}
        ${blockedBy.length > 0
          ? html`
              <div class="detail-section-title">${t("graph.blockedBy")}</div>
              <div class="detail-dep-list">
                ${blockedBy.map(
                  (n) => html`
                    <div
                      class="detail-dep-item"
                      @click=${() => this._selectNodeById(n.task.id)}
                    >
                      <span
                        class="badge-dot"
                        style="background: ${STATUS_HEX[
                          n.task.status
                        ]}; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;"
                      ></span>
                      <span class="detail-dep-ticket">${n.task.ticket_id}</span>
                      <span class="detail-dep-title">${n.task.title}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
        ${blocks.length > 0
          ? html`
              <div class="detail-section-title">${t("graph.blocks")}</div>
              <div class="detail-dep-list">
                ${blocks.map(
                  (n) => html`
                    <div
                      class="detail-dep-item"
                      @click=${() => this._selectNodeById(n.task.id)}
                    >
                      <span
                        class="badge-dot"
                        style="background: ${STATUS_HEX[
                          n.task.status
                        ]}; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;"
                      ></span>
                      <span class="detail-dep-ticket">${n.task.ticket_id}</span>
                      <span class="detail-dep-title">${n.task.title}</span>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderTooltip() {
    return html`
      <div
        class="tooltip ${this._tooltipVisible && !this._selectedNode
          ? "visible"
          : ""}"
        style="left: ${this._tooltipX}px; top: ${this._tooltipY}px;"
      >
        ${this._tooltipTask
          ? html`
              <div class="tt-ticket">${this._tooltipTask.ticket_id}</div>
              <div class="tt-title">${this._tooltipTask.title}</div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderLegend() {
    return html`
      <div class="legend">
        <div class="legend-title">${t("graph.legendStatus")}</div>
        <div class="legend-row">
          <span
            class="legend-dot"
            style="background: ${STATUS_HEX.open};"
          ></span>
          ${t("graph.legendOpen")}
        </div>
        <div class="legend-row">
          <span
            class="legend-dot"
            style="background: ${STATUS_HEX.in_progress};"
          ></span>
          ${t("graph.legendInProgress")}
        </div>
        <div class="legend-row">
          <span
            class="legend-dot"
            style="background: ${STATUS_HEX.done};"
          ></span>
          ${t("graph.legendDone")}
        </div>
        <div class="legend-row">
          <span
            class="legend-dot"
            style="background: ${STATUS_HEX.closed};"
          ></span>
          ${t("graph.legendClosed")}
        </div>
      </div>
    `;
  }

  private _renderStats() {
    const visible = this._nodes.filter((n) => n.visible).length;
    const total = this._nodes.length;
    const edges = this._links.filter((l) => l.visible).length;
    return html`
      <div class="stats-bar">
        <span>${t("graph.stats", { visible, total, edges })}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dependency-graph": DependencyGraph;
  }
}
