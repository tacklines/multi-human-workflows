import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockFetchProjectAgent = vi.fn();

vi.mock("../../state/agent-api.js", () => ({
  fetchProjectAgent: mockFetchProjectAgent,
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params && "time" in params) return `${key}:${String(params.time)}`;
    return key;
  },
}));

vi.mock("../../lib/date-utils.js", () => ({
  relativeTime: (ts: string) => `rel:${ts}`,
}));

vi.mock("../../lib/participant-utils.js", () => ({
  WS_STATUS_VARIANT: {
    running: "success",
    creating: "warning",
    pending: "warning",
    failed: "danger",
    stopped: "neutral",
    stopping: "neutral",
    destroyed: "neutral",
  },
}));

// Mock Shoelace components so they don't fail in jsdom
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/button/button.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/divider/divider.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/spinner/spinner.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));

// Mock child components to avoid their dependency chains
vi.mock("../shared/markdown-content.js", () => ({}));
vi.mock("./agent-activity-panel.js", () => ({}));
vi.mock("../invocations/invoke-dialog.js", () => ({}));

import type { AgentDetail } from "./agent-detail.js";
import type {
  ProjectAgentDetailView,
  ProjectAgentView,
  AgentActivityItem,
  AgentCommentView,
} from "../../state/agent-api.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAgent(
  overrides: Partial<ProjectAgentView> = {},
): ProjectAgentView {
  return {
    id: "agent-1",
    display_name: "Claude Coder",
    session_id: "session-1",
    session_code: "ABC123",
    session_name: "Sprint Session",
    sponsor_name: "Alice",
    client_name: "claude-code",
    client_version: "1.2.3",
    model: "claude-opus-4",
    joined_at: "2024-01-01T10:00:00Z",
    disconnected_at: null,
    is_online: true,
    current_task: null,
    workspace: null,
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<AgentActivityItem> = {},
): AgentActivityItem {
  return {
    event_type: "tool_call",
    summary: "Called read_file",
    metadata: {},
    created_at: "2024-01-01T10:05:00Z",
    ...overrides,
  };
}

function makeComment(
  overrides: Partial<AgentCommentView> = {},
): AgentCommentView {
  return {
    id: "comment-1",
    task_id: "task-1",
    task_title: "Fix the login bug",
    ticket_id: "PROJ-1",
    content: "I investigated the issue and found the root cause.",
    created_at: "2024-01-01T10:10:00Z",
    ...overrides,
  };
}

function makeDetail(
  agentOverrides: Partial<ProjectAgentView> = {},
  activity: AgentActivityItem[] = [],
  comments: AgentCommentView[] = [],
): ProjectAgentDetailView {
  return {
    agent: makeAgent(agentOverrides),
    recent_activity: activity,
    recent_comments: comments,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("agent-detail", () => {
  let el: AgentDetail;

  beforeEach(async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    await import("./agent-detail.js");
    el = document.createElement("agent-detail") as AgentDetail;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
    mockFetchProjectAgent.mockClear();
  });

  // ─── 1. Component creation ─────────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("agent-detail");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose agentId property", () => {
    el.agentId = "agent-abc";
    expect(el.agentId).toBe("agent-abc");
  });

  // ─── 2. Default / initial state ───────────────────────────────────────────

  it("starts with _loading true", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(true);
  });

  it("starts with no detail", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_detail"]).toBeNull();
  });

  it("starts with no error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  it("starts with empty agent state", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_agentState"]).toBe("");
  });

  // ─── 3. Loading state rendering ───────────────────────────────────────────

  it("renders spinner while loading", async () => {
    // Create a new element and check the shadow root before data loads
    const pending = new Promise<void>(() => {}); // never resolves
    mockFetchProjectAgent.mockReturnValue(pending);

    const loadingEl = document.createElement("agent-detail") as AgentDetail;
    loadingEl.projectId = "proj-1";
    loadingEl.agentId = "agent-1";
    document.body.appendChild(loadingEl);
    await loadingEl.updateComplete;

    const root = loadingEl.shadowRoot!;
    expect(root.querySelector(".loading")).not.toBeNull();
    expect(root.querySelector("sl-spinner")).not.toBeNull();

    document.body.removeChild(loadingEl);
  });

  // ─── 4. Error state rendering ─────────────────────────────────────────────

  it("renders error alert on fetch failure", async () => {
    mockFetchProjectAgent.mockRejectedValue(new Error("Network error"));

    const errEl = document.createElement("agent-detail") as AgentDetail;
    errEl.projectId = "proj-1";
    errEl.agentId = "agent-1";
    document.body.appendChild(errEl);
    await errEl.updateComplete;
    // Wait for the async _load to complete
    await new Promise((r) => setTimeout(r, 0));
    await errEl.updateComplete;

    const root = errEl.shadowRoot!;
    expect(root.querySelector("sl-alert")).not.toBeNull();

    document.body.removeChild(errEl);
  });

  it("shows back link in error state", async () => {
    mockFetchProjectAgent.mockRejectedValue(new Error("Not found"));

    const errEl = document.createElement("agent-detail") as AgentDetail;
    errEl.projectId = "proj-1";
    errEl.agentId = "agent-1";
    document.body.appendChild(errEl);
    await errEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await errEl.updateComplete;

    const root = errEl.shadowRoot!;
    const backLink = root.querySelector(".back-link");
    expect(backLink).not.toBeNull();

    document.body.removeChild(errEl);
  });

  // ─── 5. Agent metadata display ────────────────────────────────────────────

  it("renders agent display name", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ display_name: "Awesome Bot" }),
    );

    const detailEl = document.createElement("agent-detail") as AgentDetail;
    detailEl.projectId = "proj-1";
    detailEl.agentId = "agent-1";
    document.body.appendChild(detailEl);
    await detailEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await detailEl.updateComplete;

    const root = detailEl.shadowRoot!;
    const heading = root.querySelector(".agent-header h2");
    expect(heading?.textContent?.trim()).toBe("Awesome Bot");

    document.body.removeChild(detailEl);
  });

  it("renders online status indicator when agent is online", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ is_online: true }));

    const onlineEl = document.createElement("agent-detail") as AgentDetail;
    onlineEl.projectId = "proj-1";
    onlineEl.agentId = "agent-1";
    document.body.appendChild(onlineEl);
    await onlineEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await onlineEl.updateComplete;

    const root = onlineEl.shadowRoot!;
    const indicator = root.querySelector(".status-indicator");
    expect(indicator?.classList.contains("online")).toBe(true);

    document.body.removeChild(onlineEl);
  });

  it("renders offline status indicator when agent is offline", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ is_online: false, disconnected_at: "2024-01-01T11:00:00Z" }),
    );

    const offlineEl = document.createElement("agent-detail") as AgentDetail;
    offlineEl.projectId = "proj-1";
    offlineEl.agentId = "agent-1";
    document.body.appendChild(offlineEl);
    await offlineEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await offlineEl.updateComplete;

    const root = offlineEl.shadowRoot!;
    const indicator = root.querySelector(".status-indicator");
    expect(indicator?.classList.contains("offline")).toBe(true);

    document.body.removeChild(offlineEl);
  });

  it("renders model info card when model is present", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ model: "claude-opus-4" }),
    );

    const withModelEl = document.createElement("agent-detail") as AgentDetail;
    withModelEl.projectId = "proj-1";
    withModelEl.agentId = "agent-1";
    document.body.appendChild(withModelEl);
    await withModelEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await withModelEl.updateComplete;

    const root = withModelEl.shadowRoot!;
    const infoValues = Array.from(root.querySelectorAll(".info-value.mono"));
    const modelValue = infoValues.find((el) =>
      el.textContent?.includes("claude-opus-4"),
    );
    expect(modelValue).not.toBeUndefined();

    document.body.removeChild(withModelEl);
  });

  it("omits model info card when model is null", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ model: null }));

    const noModelEl = document.createElement("agent-detail") as AgentDetail;
    noModelEl.projectId = "proj-1";
    noModelEl.agentId = "agent-1";
    document.body.appendChild(noModelEl);
    await noModelEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noModelEl.updateComplete;

    const root = noModelEl.shadowRoot!;
    const labels = Array.from(root.querySelectorAll(".info-label"));
    const modelLabel = labels.find((el) =>
      el.textContent?.includes("agentDetail.model"),
    );
    expect(modelLabel).toBeUndefined();

    document.body.removeChild(noModelEl);
  });

  it("renders client name with version", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ client_name: "claude-code", client_version: "2.0.0" }),
    );

    const withClientEl = document.createElement("agent-detail") as AgentDetail;
    withClientEl.projectId = "proj-1";
    withClientEl.agentId = "agent-1";
    document.body.appendChild(withClientEl);
    await withClientEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await withClientEl.updateComplete;

    const root = withClientEl.shadowRoot!;
    const infoValues = Array.from(root.querySelectorAll(".info-value.mono"));
    const clientValue = infoValues.find((el) =>
      el.textContent?.includes("claude-code"),
    );
    expect(clientValue).not.toBeUndefined();
    expect(clientValue?.textContent).toContain("v2.0.0");

    document.body.removeChild(withClientEl);
  });

  it("renders sponsor name when present", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ sponsor_name: "Bob" }),
    );

    const sponsoredEl = document.createElement("agent-detail") as AgentDetail;
    sponsoredEl.projectId = "proj-1";
    sponsoredEl.agentId = "agent-1";
    document.body.appendChild(sponsoredEl);
    await sponsoredEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await sponsoredEl.updateComplete;

    const root = sponsoredEl.shadowRoot!;
    const infoValues = Array.from(root.querySelectorAll(".info-value"));
    const sponsorValue = infoValues.find(
      (el) => el.textContent?.trim() === "Bob",
    );
    expect(sponsorValue).not.toBeUndefined();

    document.body.removeChild(sponsoredEl);
  });

  it("renders disconnected_at card when agent has disconnected", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        is_online: false,
        disconnected_at: "2024-01-01T11:00:00Z",
      }),
    );

    const discEl = document.createElement("agent-detail") as AgentDetail;
    discEl.projectId = "proj-1";
    discEl.agentId = "agent-1";
    document.body.appendChild(discEl);
    await discEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await discEl.updateComplete;

    const root = discEl.shadowRoot!;
    const labels = Array.from(root.querySelectorAll(".info-label"));
    const disconnectedLabel = labels.find((el) =>
      el.textContent?.includes("agentDetail.disconnected"),
    );
    expect(disconnectedLabel).not.toBeUndefined();

    document.body.removeChild(discEl);
  });

  // ─── 6. Current task rendering ────────────────────────────────────────────

  it("renders current task section when agent has a task", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        current_task: {
          id: "task-1",
          ticket_id: "PROJ-42",
          title: "Build the thing",
          status: "in_progress",
          task_type: "task",
        },
      }),
    );

    const taskEl = document.createElement("agent-detail") as AgentDetail;
    taskEl.projectId = "proj-1";
    taskEl.agentId = "agent-1";
    document.body.appendChild(taskEl);
    await taskEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await taskEl.updateComplete;

    const root = taskEl.shadowRoot!;
    const taskCard = root.querySelector(".task-card");
    expect(taskCard).not.toBeNull();

    const ticketEl = root.querySelector(".task-ticket");
    expect(ticketEl?.textContent?.trim()).toBe("PROJ-42");

    const titleEl = root.querySelector(".task-title");
    expect(titleEl?.textContent?.trim()).toBe("Build the thing");

    document.body.removeChild(taskEl);
  });

  it("does not render task section when agent has no task", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ current_task: null }));

    const noTaskEl = document.createElement("agent-detail") as AgentDetail;
    noTaskEl.projectId = "proj-1";
    noTaskEl.agentId = "agent-1";
    document.body.appendChild(noTaskEl);
    await noTaskEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noTaskEl.updateComplete;

    const root = noTaskEl.shadowRoot!;
    expect(root.querySelector(".task-card")).toBeNull();

    document.body.removeChild(noTaskEl);
  });

  // ─── 7. Workspace rendering ───────────────────────────────────────────────

  it("renders workspace card when agent has a workspace", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        workspace: {
          id: "ws-1",
          status: "running",
          coder_workspace_name: "agent-coder-abc123",
          branch: "agent/coder-abc123",
          started_at: "2024-01-01T10:00:00Z",
          error_message: null,
        },
      }),
    );

    const wsEl = document.createElement("agent-detail") as AgentDetail;
    wsEl.projectId = "proj-1";
    wsEl.agentId = "agent-1";
    document.body.appendChild(wsEl);
    await wsEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await wsEl.updateComplete;

    const root = wsEl.shadowRoot!;
    const wsCard = root.querySelector(".workspace-card");
    expect(wsCard).not.toBeNull();

    const wsName = root.querySelector(".ws-name");
    expect(wsName?.textContent?.trim()).toBe("agent-coder-abc123");

    const branchBadge = root.querySelector(".branch-badge");
    expect(branchBadge?.textContent?.trim()).toBe("agent/coder-abc123");

    document.body.removeChild(wsEl);
  });

  it("renders workspace error message when present", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        workspace: {
          id: "ws-1",
          status: "failed",
          coder_workspace_name: "agent-coder-abc123",
          branch: null,
          started_at: null,
          error_message: "Workspace provisioning failed",
        },
      }),
    );

    const wsErrEl = document.createElement("agent-detail") as AgentDetail;
    wsErrEl.projectId = "proj-1";
    wsErrEl.agentId = "agent-1";
    document.body.appendChild(wsErrEl);
    await wsErrEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await wsErrEl.updateComplete;

    const root = wsErrEl.shadowRoot!;
    const wsError = root.querySelector(".ws-error");
    expect(wsError?.textContent?.trim()).toBe("Workspace provisioning failed");

    document.body.removeChild(wsErrEl);
  });

  it("does not render workspace section when agent has no workspace", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ workspace: null }));

    const noWsEl = document.createElement("agent-detail") as AgentDetail;
    noWsEl.projectId = "proj-1";
    noWsEl.agentId = "agent-1";
    document.body.appendChild(noWsEl);
    await noWsEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noWsEl.updateComplete;

    const root = noWsEl.shadowRoot!;
    expect(root.querySelector(".workspace-card")).toBeNull();

    document.body.removeChild(noWsEl);
  });

  // ─── 8. Activity panel integration ───────────────────────────────────────

  it("renders agent-activity-panel element", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const actEl = document.createElement("agent-detail") as AgentDetail;
    actEl.projectId = "proj-1";
    actEl.agentId = "agent-1";
    document.body.appendChild(actEl);
    await actEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await actEl.updateComplete;

    const root = actEl.shadowRoot!;
    expect(root.querySelector("agent-activity-panel")).not.toBeNull();

    document.body.removeChild(actEl);
  });

  it("updates _agentState on agent-state-change event", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ is_online: true }));

    const stateEl = document.createElement("agent-detail") as AgentDetail;
    stateEl.projectId = "proj-1";
    stateEl.agentId = "agent-1";
    document.body.appendChild(stateEl);
    await stateEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await stateEl.updateComplete;

    const root = stateEl.shadowRoot!;
    const panel = root.querySelector("agent-activity-panel")!;
    panel.dispatchEvent(
      new CustomEvent("agent-state-change", {
        detail: { state: "working" },
        bubbles: true,
      }),
    );
    await stateEl.updateComplete;

    const comp = stateEl as unknown as Record<string, unknown>;
    expect(comp["_agentState"]).toBe("working");

    document.body.removeChild(stateEl);
  });

  // ─── 9. Activity history rendering ───────────────────────────────────────

  it("renders recent activity timeline items", async () => {
    const activity = [
      makeActivity({ event_type: "tool_call", summary: "read_file called" }),
      makeActivity({ event_type: "state_change", summary: "Agent went idle" }),
    ];
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, activity));

    const activityEl = document.createElement("agent-detail") as AgentDetail;
    activityEl.projectId = "proj-1";
    activityEl.agentId = "agent-1";
    document.body.appendChild(activityEl);
    await activityEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await activityEl.updateComplete;

    const root = activityEl.shadowRoot!;
    const items = root.querySelectorAll(".timeline-item");
    expect(items.length).toBe(2);

    const firstEvent = items[0].querySelector(".timeline-event");
    expect(firstEvent?.textContent?.trim()).toBe("tool_call");

    const firstSummary = items[0].querySelector(".timeline-summary");
    expect(firstSummary?.textContent?.trim()).toBe("read_file called");

    document.body.removeChild(activityEl);
  });

  it("renders empty hint when no activity", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, []));

    const emptyEl = document.createElement("agent-detail") as AgentDetail;
    emptyEl.projectId = "proj-1";
    emptyEl.agentId = "agent-1";
    document.body.appendChild(emptyEl);
    await emptyEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await emptyEl.updateComplete;

    const root = emptyEl.shadowRoot!;
    const emptyHints = root.querySelectorAll(".empty-hint");
    // At least one empty hint (activity section)
    const activityEmptyHint = Array.from(emptyHints).find((el) =>
      el.textContent?.includes("agentDetail.noActivity"),
    );
    expect(activityEmptyHint).not.toBeUndefined();

    document.body.removeChild(emptyEl);
  });

  it("shows activity count badge", async () => {
    const activity = [
      makeActivity({ event_type: "tool_call", summary: "First" }),
      makeActivity({ event_type: "tool_call", summary: "Second" }),
      makeActivity({ event_type: "tool_call", summary: "Third" }),
    ];
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, activity));

    const countEl = document.createElement("agent-detail") as AgentDetail;
    countEl.projectId = "proj-1";
    countEl.agentId = "agent-1";
    document.body.appendChild(countEl);
    await countEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await countEl.updateComplete;

    const root = countEl.shadowRoot!;
    // The activity section title contains a badge with the count
    const badges = Array.from(root.querySelectorAll("sl-badge"));
    const countBadge = badges.find((b) => b.textContent?.trim() === "3");
    expect(countBadge).not.toBeUndefined();

    document.body.removeChild(countEl);
  });

  // ─── 10. Comments rendering ───────────────────────────────────────────────

  it("renders recent comments", async () => {
    const comments = [
      makeComment({
        ticket_id: "PROJ-1",
        task_title: "Login bug",
        content: "Found the root cause",
      }),
    ];
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, [], comments));

    const commentsEl = document.createElement("agent-detail") as AgentDetail;
    commentsEl.projectId = "proj-1";
    commentsEl.agentId = "agent-1";
    document.body.appendChild(commentsEl);
    await commentsEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await commentsEl.updateComplete;

    const root = commentsEl.shadowRoot!;
    const commentCards = root.querySelectorAll(".comment-card");
    expect(commentCards.length).toBe(1);

    const ticket = commentCards[0].querySelector(".comment-ticket");
    expect(ticket?.textContent?.trim()).toBe("PROJ-1");

    const taskTitle = commentCards[0].querySelector(".comment-task-title");
    expect(taskTitle?.textContent?.trim()).toBe("Login bug");

    const content = commentCards[0].querySelector(".comment-content");
    expect(content?.textContent?.trim()).toBe("Found the root cause");

    document.body.removeChild(commentsEl);
  });

  it("renders empty hint when no comments", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, [], []));

    const noCommentsEl = document.createElement("agent-detail") as AgentDetail;
    noCommentsEl.projectId = "proj-1";
    noCommentsEl.agentId = "agent-1";
    document.body.appendChild(noCommentsEl);
    await noCommentsEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noCommentsEl.updateComplete;

    const root = noCommentsEl.shadowRoot!;
    const emptyHints = root.querySelectorAll(".empty-hint");
    const commentsEmptyHint = Array.from(emptyHints).find((el) =>
      el.textContent?.includes("agentDetail.noComments"),
    );
    expect(commentsEmptyHint).not.toBeUndefined();

    document.body.removeChild(noCommentsEl);
  });

  // ─── 11. Back navigation ──────────────────────────────────────────────────

  it("dispatches agent-back event when back link is clicked", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const navEl = document.createElement("agent-detail") as AgentDetail;
    navEl.projectId = "proj-1";
    navEl.agentId = "agent-1";
    document.body.appendChild(navEl);
    await navEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await navEl.updateComplete;

    const events: Event[] = [];
    navEl.addEventListener("agent-back", (e) => events.push(e));

    const root = navEl.shadowRoot!;
    const backLink = root.querySelector(".back-link") as HTMLElement;
    backLink?.click();

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("agent-back");

    document.body.removeChild(navEl);
  });

  it("dispatches agent-back event on Enter keydown on back link", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const navKeyEl = document.createElement("agent-detail") as AgentDetail;
    navKeyEl.projectId = "proj-1";
    navKeyEl.agentId = "agent-1";
    document.body.appendChild(navKeyEl);
    await navKeyEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await navKeyEl.updateComplete;

    const events: Event[] = [];
    navKeyEl.addEventListener("agent-back", (e) => events.push(e));

    const root = navKeyEl.shadowRoot!;
    const backLink = root.querySelector(".back-link") as HTMLElement;
    backLink?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(events.length).toBe(1);

    document.body.removeChild(navKeyEl);
  });

  // ─── 12. API call behaviour ───────────────────────────────────────────────

  it("calls fetchProjectAgent with projectId and agentId", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const apiEl = document.createElement("agent-detail") as AgentDetail;
    apiEl.projectId = "proj-abc";
    apiEl.agentId = "agent-xyz";
    document.body.appendChild(apiEl);
    await apiEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetchProjectAgent).toHaveBeenCalledWith("proj-abc", "agent-xyz");

    document.body.removeChild(apiEl);
  });

  it("does not call fetchProjectAgent when projectId is empty", async () => {
    mockFetchProjectAgent.mockClear();
    const emptyProjEl = document.createElement("agent-detail") as AgentDetail;
    emptyProjEl.agentId = "agent-xyz";
    document.body.appendChild(emptyProjEl);
    await emptyProjEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetchProjectAgent).not.toHaveBeenCalled();

    document.body.removeChild(emptyProjEl);
  });

  it("does not call fetchProjectAgent when agentId is empty", async () => {
    mockFetchProjectAgent.mockClear();
    const emptyAgentEl = document.createElement("agent-detail") as AgentDetail;
    emptyAgentEl.projectId = "proj-abc";
    document.body.appendChild(emptyAgentEl);
    await emptyAgentEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(mockFetchProjectAgent).not.toHaveBeenCalled();

    document.body.removeChild(emptyAgentEl);
  });

  it("reloads when projectId changes", async () => {
    mockFetchProjectAgent.mockClear();
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const reloadEl = document.createElement("agent-detail") as AgentDetail;
    reloadEl.projectId = "proj-1";
    reloadEl.agentId = "agent-1";
    document.body.appendChild(reloadEl);
    await reloadEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    // Record call count after initial load, then trigger a prop change
    const callsBeforeChange = mockFetchProjectAgent.mock.calls.length;
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ display_name: "New Bot" }),
    );
    reloadEl.projectId = "proj-2";
    await reloadEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const callsAfterChange = mockFetchProjectAgent.mock.calls.length;
    expect(callsAfterChange).toBeGreaterThan(callsBeforeChange);
    expect(mockFetchProjectAgent).toHaveBeenLastCalledWith("proj-2", "agent-1");

    document.body.removeChild(reloadEl);
  });

  it("reloads when agentId changes", async () => {
    mockFetchProjectAgent.mockClear();
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const reloadAgentEl = document.createElement("agent-detail") as AgentDetail;
    reloadAgentEl.projectId = "proj-1";
    reloadAgentEl.agentId = "agent-1";
    document.body.appendChild(reloadAgentEl);
    await reloadAgentEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    // Record call count after initial load, then trigger a prop change
    const callsBeforeChange = mockFetchProjectAgent.mock.calls.length;
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ display_name: "Second Bot" }),
    );
    reloadAgentEl.agentId = "agent-2";
    await reloadAgentEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const callsAfterChange = mockFetchProjectAgent.mock.calls.length;
    expect(callsAfterChange).toBeGreaterThan(callsBeforeChange);
    expect(mockFetchProjectAgent).toHaveBeenLastCalledWith("proj-1", "agent-2");

    document.body.removeChild(reloadAgentEl);
  });

  // ─── 13. Dispatch action menu ─────────────────────────────────────────────

  it("shows continue menu item only when agent has a current task", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        current_task: {
          id: "task-1",
          ticket_id: "PROJ-1",
          title: "Some task",
          status: "in_progress",
          task_type: "task",
        },
      }),
    );

    const withTaskEl = document.createElement("agent-detail") as AgentDetail;
    withTaskEl.projectId = "proj-1";
    withTaskEl.agentId = "agent-1";
    document.body.appendChild(withTaskEl);
    await withTaskEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await withTaskEl.updateComplete;

    const root = withTaskEl.shadowRoot!;
    const menuItems = Array.from(root.querySelectorAll("sl-menu-item"));
    const continueItem = menuItems.find(
      (item) => item.getAttribute("value") === "continue",
    );
    expect(continueItem).not.toBeUndefined();

    document.body.removeChild(withTaskEl);
  });

  it("hides continue menu item when agent has no task", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail({ current_task: null }));

    const noTaskMenuEl = document.createElement("agent-detail") as AgentDetail;
    noTaskMenuEl.projectId = "proj-1";
    noTaskMenuEl.agentId = "agent-1";
    document.body.appendChild(noTaskMenuEl);
    await noTaskMenuEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noTaskMenuEl.updateComplete;

    const root = noTaskMenuEl.shadowRoot!;
    const menuItems = Array.from(root.querySelectorAll("sl-menu-item"));
    const continueItem = menuItems.find(
      (item) => item.getAttribute("value") === "continue",
    );
    expect(continueItem).toBeUndefined();

    document.body.removeChild(noTaskMenuEl);
  });

  it("shows diagnose menu item when workspace has error", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        workspace: {
          id: "ws-1",
          status: "failed",
          coder_workspace_name: "agent-ws",
          branch: null,
          started_at: null,
          error_message: "Something went wrong",
        },
      }),
    );

    const errMenuEl = document.createElement("agent-detail") as AgentDetail;
    errMenuEl.projectId = "proj-1";
    errMenuEl.agentId = "agent-1";
    document.body.appendChild(errMenuEl);
    await errMenuEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await errMenuEl.updateComplete;

    const root = errMenuEl.shadowRoot!;
    const menuItems = Array.from(root.querySelectorAll("sl-menu-item"));
    const diagnoseItem = menuItems.find(
      (item) => item.getAttribute("value") === "diagnose",
    );
    expect(diagnoseItem).not.toBeUndefined();

    document.body.removeChild(errMenuEl);
  });

  it("shows diagnose menu item when agent is offline", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ is_online: false, disconnected_at: "2024-01-01T11:00:00Z" }),
    );

    const offlineMenuEl = document.createElement("agent-detail") as AgentDetail;
    offlineMenuEl.projectId = "proj-1";
    offlineMenuEl.agentId = "agent-1";
    document.body.appendChild(offlineMenuEl);
    await offlineMenuEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await offlineMenuEl.updateComplete;

    const root = offlineMenuEl.shadowRoot!;
    const menuItems = Array.from(root.querySelectorAll("sl-menu-item"));
    const diagnoseItem = menuItems.find(
      (item) => item.getAttribute("value") === "diagnose",
    );
    expect(diagnoseItem).not.toBeUndefined();

    document.body.removeChild(offlineMenuEl);
  });

  it("always shows review and custom menu items", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const menuEl = document.createElement("agent-detail") as AgentDetail;
    menuEl.projectId = "proj-1";
    menuEl.agentId = "agent-1";
    document.body.appendChild(menuEl);
    await menuEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await menuEl.updateComplete;

    const root = menuEl.shadowRoot!;
    const menuItems = Array.from(root.querySelectorAll("sl-menu-item"));
    const values = menuItems.map((item) => item.getAttribute("value"));
    expect(values).toContain("review");
    expect(values).toContain("custom");

    document.body.removeChild(menuEl);
  });

  // ─── 14. _handleDispatchAction ────────────────────────────────────────────

  it("_handleDispatchAction calls _invokeDialog.show() for custom action", async () => {
    mockFetchProjectAgent.mockResolvedValue(makeDetail());

    const actionEl = document.createElement("agent-detail") as AgentDetail;
    actionEl.projectId = "proj-1";
    actionEl.agentId = "agent-1";
    document.body.appendChild(actionEl);
    await actionEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await actionEl.updateComplete;

    // Override the @query getter with a mock invoke dialog
    const showFn = vi.fn();
    const mockDialog = { show: showFn, showWithPerspective: vi.fn() };
    Object.defineProperty(actionEl, "_invokeDialog", {
      get: () => mockDialog,
      configurable: true,
    });

    // Trigger the private method directly
    const comp = actionEl as unknown as Record<string, unknown>;
    const handler = comp["_handleDispatchAction"] as (e: CustomEvent) => void;
    handler.call(
      actionEl,
      new CustomEvent("sl-select", {
        detail: { item: { value: "custom" } },
      }),
    );

    expect(showFn).toHaveBeenCalledOnce();

    document.body.removeChild(actionEl);
  });

  it("_handleDispatchAction calls showWithPerspective for review action", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        display_name: "TestBot",
        workspace: {
          id: "ws-1",
          status: "running",
          coder_workspace_name: "agent-ws",
          branch: "feature/xyz",
          started_at: null,
          error_message: null,
        },
      }),
    );

    const reviewEl = document.createElement("agent-detail") as AgentDetail;
    reviewEl.projectId = "proj-1";
    reviewEl.agentId = "agent-1";
    document.body.appendChild(reviewEl);
    await reviewEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await reviewEl.updateComplete;

    const showWithPerspectiveFn = vi.fn();
    const mockDialog = {
      show: vi.fn(),
      showWithPerspective: showWithPerspectiveFn,
    };
    Object.defineProperty(reviewEl, "_invokeDialog", {
      get: () => mockDialog,
      configurable: true,
    });

    const comp = reviewEl as unknown as Record<string, unknown>;
    const handler = comp["_handleDispatchAction"] as (e: CustomEvent) => void;
    handler.call(
      reviewEl,
      new CustomEvent("sl-select", {
        detail: { item: { value: "review" } },
      }),
    );

    expect(showWithPerspectiveFn).toHaveBeenCalledOnce();
    const [perspective, prompt] = showWithPerspectiveFn.mock.calls[0];
    expect(perspective).toBe("reviewer");
    expect(prompt).toContain("TestBot");
    expect(prompt).toContain("feature/xyz");

    document.body.removeChild(reviewEl);
  });

  it("_handleDispatchAction calls showWithPerspective for continue action", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({
        current_task: {
          id: "task-1",
          ticket_id: "PROJ-1",
          title: "My big task",
          status: "in_progress",
          task_type: "task",
        },
      }),
    );

    const continueEl = document.createElement("agent-detail") as AgentDetail;
    continueEl.projectId = "proj-1";
    continueEl.agentId = "agent-1";
    document.body.appendChild(continueEl);
    await continueEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await continueEl.updateComplete;

    const showWithPerspectiveFn = vi.fn();
    const mockDialog = {
      show: vi.fn(),
      showWithPerspective: showWithPerspectiveFn,
    };
    Object.defineProperty(continueEl, "_invokeDialog", {
      get: () => mockDialog,
      configurable: true,
    });

    const comp = continueEl as unknown as Record<string, unknown>;
    const handler = comp["_handleDispatchAction"] as (e: CustomEvent) => void;
    handler.call(
      continueEl,
      new CustomEvent("sl-select", {
        detail: { item: { value: "continue" } },
      }),
    );

    expect(showWithPerspectiveFn).toHaveBeenCalledOnce();
    const [perspective, prompt] = showWithPerspectiveFn.mock.calls[0];
    expect(perspective).toBe("coder");
    expect(prompt).toContain("My big task");

    document.body.removeChild(continueEl);
  });

  // ─── 15. Edge cases ───────────────────────────────────────────────────────

  it("limits activity timeline to 20 items when more are present", async () => {
    const activity = Array.from({ length: 25 }, (_, i) =>
      makeActivity({ event_type: "tool_call", summary: `Event ${i}` }),
    );
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, activity));

    const manyActEl = document.createElement("agent-detail") as AgentDetail;
    manyActEl.projectId = "proj-1";
    manyActEl.agentId = "agent-1";
    document.body.appendChild(manyActEl);
    await manyActEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await manyActEl.updateComplete;

    const root = manyActEl.shadowRoot!;
    const items = root.querySelectorAll(".timeline-item");
    expect(items.length).toBe(20);

    document.body.removeChild(manyActEl);
  });

  it("limits comments to 15 items when more are present", async () => {
    const comments = Array.from({ length: 20 }, (_, i) =>
      makeComment({ id: `comment-${i}`, content: `Comment ${i}` }),
    );
    mockFetchProjectAgent.mockResolvedValue(makeDetail({}, [], comments));

    const manyCommentsEl = document.createElement(
      "agent-detail",
    ) as AgentDetail;
    manyCommentsEl.projectId = "proj-1";
    manyCommentsEl.agentId = "agent-1";
    document.body.appendChild(manyCommentsEl);
    await manyCommentsEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await manyCommentsEl.updateComplete;

    const root = manyCommentsEl.shadowRoot!;
    const cards = root.querySelectorAll(".comment-card");
    expect(cards.length).toBe(15);

    document.body.removeChild(manyCommentsEl);
  });

  it("renders session name when present", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ session_name: "Q1 Planning Session" }),
    );

    const sessionNameEl = document.createElement("agent-detail") as AgentDetail;
    sessionNameEl.projectId = "proj-1";
    sessionNameEl.agentId = "agent-1";
    document.body.appendChild(sessionNameEl);
    await sessionNameEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await sessionNameEl.updateComplete;

    const root = sessionNameEl.shadowRoot!;
    const infoValues = Array.from(root.querySelectorAll(".info-value"));
    const sessionValue = infoValues.find(
      (el) => el.textContent?.trim() === "Q1 Planning Session",
    );
    expect(sessionValue).not.toBeUndefined();

    document.body.removeChild(sessionNameEl);
  });

  it("falls back to session code when session name is null", async () => {
    mockFetchProjectAgent.mockResolvedValue(
      makeDetail({ session_name: null, session_code: "XYZ789" }),
    );

    const noNameEl = document.createElement("agent-detail") as AgentDetail;
    noNameEl.projectId = "proj-1";
    noNameEl.agentId = "agent-1";
    document.body.appendChild(noNameEl);
    await noNameEl.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await noNameEl.updateComplete;

    const root = noNameEl.shadowRoot!;
    const infoValues = Array.from(root.querySelectorAll(".info-value"));
    const codeValue = infoValues.find(
      (el) => el.textContent?.trim() === "XYZ789",
    );
    expect(codeValue).not.toBeUndefined();

    document.body.removeChild(noNameEl);
  });
});
