import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the component
const mockFetchTasks = vi.fn();
const mockFetchProjectTasks = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();

vi.mock("../../state/task-api.js", () => ({
  fetchTasks: mockFetchTasks,
  fetchProjectTasks: mockFetchProjectTasks,
  updateTask: mockUpdateTask,
  deleteTask: mockDeleteTask,
}));

vi.mock("../../state/auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

vi.mock("../../lib/i18n.js", () => ({
  t: (key: string, _params?: Record<string, unknown>) => key,
}));

vi.mock("../../router.js", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("../../state/app-state.js", () => ({
  store: {
    subscribe: vi.fn().mockReturnValue(() => {}),
    get: vi.fn().mockReturnValue({ sessionState: null }),
  },
}));

vi.mock("../../lib/participant-utils.js", () => ({
  getParticipantName: vi.fn().mockReturnValue("Test User"),
}));

// Mock Shoelace components so they don't fail in jsdom
vi.mock("@shoelace-style/shoelace/dist/components/button/button.js", () => ({}));
vi.mock("@shoelace-style/shoelace/dist/components/icon/icon.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/badge/badge.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/spinner/spinner.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/alert/alert.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/menu/menu.js", () => ({}));
vi.mock(
  "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js",
  () => ({}),
);
vi.mock(
  "@shoelace-style/shoelace/dist/components/divider/divider.js",
  () => ({}),
);
vi.mock("@shoelace-style/shoelace/dist/components/tag/tag.js", () => ({}));

// Mock child components to avoid their dependency chains
vi.mock("./task-detail.js", () => ({}));
vi.mock("./task-create-dialog.js", () => ({}));
vi.mock("./task-sprint-panel.js", () => ({}));
vi.mock("./task-board-toolbar.js", () => ({}));
vi.mock("./task-shortcuts-dialog.js", () => ({}));
vi.mock("../invocations/invoke-dialog.js", () => ({}));

import type { TaskBoard } from "./task-board.js";
import type { TaskView } from "../../state/task-types.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "task-1",
    session_id: null,
    project_id: "proj-1",
    ticket_number: 1,
    ticket_id: "PROJ-1",
    parent_id: null,
    task_type: "task",
    title: "Fix the login bug",
    description: null,
    status: "open",
    priority: "medium",
    complexity: "small",
    assigned_to: null,
    created_by: "user-1",
    commit_hashes: [],
    no_code_change: false,
    session_ids: [],
    source_task_id: null,
    model_hint: null,
    budget_tier: null,
    provider: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    child_count: 0,
    comment_count: 0,
    ...overrides,
  };
}

const sampleTasks: TaskView[] = [
  makeTask({ id: "task-1", ticket_id: "PROJ-1", title: "Open task", status: "open", task_type: "task" }),
  makeTask({ id: "task-2", ticket_id: "PROJ-2", title: "In-progress story", status: "in_progress", task_type: "story" }),
  makeTask({ id: "task-3", ticket_id: "PROJ-3", title: "Done bug", status: "done", task_type: "bug" }),
  makeTask({ id: "task-4", ticket_id: "PROJ-4", title: "Closed epic", status: "closed", task_type: "epic" }),
];

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("task-board", () => {
  let el: TaskBoard;

  beforeEach(async () => {
    mockFetchProjectTasks.mockResolvedValue([]);
    mockFetchTasks.mockResolvedValue([]);
    mockUpdateTask.mockResolvedValue({});
    mockDeleteTask.mockResolvedValue({});

    await import("./task-board.js");
    el = document.createElement("task-board") as TaskBoard;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
    vi.restoreAllMocks();
  });

  // ─── 1. Component creation ───────────────────────────────────────────────

  it("should create element", () => {
    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe("task-board");
  });

  it("should expose projectId property", () => {
    el.projectId = "proj-123";
    expect(el.projectId).toBe("proj-123");
  });

  it("should expose sessionCode property", () => {
    el.sessionCode = "ABC123";
    expect(el.sessionCode).toBe("ABC123");
  });

  it("should expose participants property", () => {
    el.participants = [];
    expect(el.participants).toEqual([]);
  });

  it("should expose sessions property", () => {
    el.sessions = [];
    expect(el.sessions).toEqual([]);
  });

  // ─── 2. Default state ────────────────────────────────────────────────────

  it("starts in loading state", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_loading"]).toBe(true);
  });

  it("starts with board view mode", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_viewMode"]).toBe("board");
  });

  it("starts with no error", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_error"]).toBe("");
  });

  it("starts with hideCompleted true", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_hideCompleted"]).toBe(true);
  });

  it("starts with no selected task", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_selectedTaskId"]).toBeNull();
  });

  it("starts with empty selection set", () => {
    const comp = el as unknown as Record<string, unknown>;
    const selectedIds = comp["_selectedIds"] as Set<string>;
    expect(selectedIds.size).toBe(0);
  });

  it("starts with selectMode false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_selectMode"]).toBe(false);
  });

  it("starts with empty search query", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_searchQuery"]).toBe("");
  });

  it("starts with no filter type", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_filterType"]).toBe("");
  });

  it("starts with no filter status", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_filterStatus"]).toBe("");
  });

  it("starts with sortBy set to created", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_sortBy"]).toBe("created");
  });

  it("starts with showShortcuts false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_showShortcuts"]).toBe(false);
  });

  it("starts with sprintPanelOpen false", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_sprintPanelOpen"]).toBe(false);
  });

  // ─── 3. _isProjectMode computed getter ───────────────────────────────────

  it("_isProjectMode is true when only projectId is set", () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    // Access as getter via the prototype
    expect((comp["_isProjectMode"] as boolean)).toBe(true);
  });

  it("_isProjectMode is false when sessionCode is set", () => {
    el.projectId = "proj-1";
    el.sessionCode = "ABC123";
    const comp = el as unknown as Record<string, unknown>;
    expect((comp["_isProjectMode"] as boolean)).toBe(false);
  });

  it("_isProjectMode is false when neither is set", () => {
    el.projectId = "";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    expect((comp["_isProjectMode"] as boolean)).toBe(false);
  });

  // ─── 4. _loadTasks ───────────────────────────────────────────────────────

  it("does not call fetch when neither sessionCode nor projectId is set", async () => {
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTasks.mockClear();
    mockFetchProjectTasks.mockClear();

    await (comp["_loadTasks"] as () => Promise<void>).call(el);

    expect(mockFetchTasks).not.toHaveBeenCalled();
    expect(mockFetchProjectTasks).not.toHaveBeenCalled();
  });

  it("calls fetchProjectTasks when in project mode", async () => {
    el.projectId = "proj-abc";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchProjectTasks.mockResolvedValue([]);

    await (comp["_loadTasks"] as () => Promise<void>).call(el);

    expect(mockFetchProjectTasks).toHaveBeenCalledWith("proj-abc", expect.any(Object));
    expect(mockFetchTasks).not.toHaveBeenCalled();
  });

  it("calls fetchTasks when sessionCode is set", async () => {
    el.sessionCode = "SES123";
    el.projectId = "";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchTasks.mockResolvedValue([]);
    // Clear any calls that happened during the previous test's connectedCallback
    mockFetchTasks.mockClear();
    mockFetchProjectTasks.mockClear();

    await (comp["_loadTasks"] as () => Promise<void>).call(el);

    expect(mockFetchTasks).toHaveBeenCalledWith("SES123", expect.any(Object));
    expect(mockFetchProjectTasks).not.toHaveBeenCalled();
  });

  it("sets _tasks and clears _loading on successful fetch", async () => {
    el.projectId = "proj-xyz";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchProjectTasks.mockResolvedValue(sampleTasks);

    await (comp["_loadTasks"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect(comp["_tasks"]).toEqual(sampleTasks);
    expect(comp["_error"]).toBe("");
  });

  it("sets _error and clears _loading on failed fetch", async () => {
    el.projectId = "proj-err";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    mockFetchProjectTasks.mockRejectedValueOnce(new Error("Network failure"));

    await (comp["_loadTasks"] as () => Promise<void>).call(el);

    expect(comp["_loading"]).toBe(false);
    expect(comp["_error"]).toBe("Network failure");
  });

  // ─── 5. _filteredTasks computed getter ───────────────────────────────────

  it("_filteredTasks excludes done and closed tasks when hideCompleted is true", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    comp["_hideCompleted"] = true;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "";
    comp["_filterAssignee"] = "";

    const filtered = comp["_filteredTasks"] as TaskView[];
    const statuses = filtered.map((t) => t.status);

    expect(statuses).not.toContain("done");
    expect(statuses).not.toContain("closed");
    expect(statuses).toContain("open");
    expect(statuses).toContain("in_progress");
  });

  it("_filteredTasks includes all statuses when hideCompleted is false", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    comp["_hideCompleted"] = false;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "";
    comp["_filterAssignee"] = "";

    const filtered = comp["_filteredTasks"] as TaskView[];
    const statuses = filtered.map((t) => t.status);

    expect(statuses).toContain("open");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("done");
    expect(statuses).toContain("closed");
  });

  it("_filteredTasks filters by searchQuery title match", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    comp["_hideCompleted"] = false;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "login";
    comp["_filterAssignee"] = "";

    // sampleTasks have titles: "Open task", "In-progress story", "Done bug", "Closed epic"
    // none match "login" — result should be empty
    const filtered = comp["_filteredTasks"] as TaskView[];
    expect(filtered).toHaveLength(0);
  });

  it("_filteredTasks returns matching tasks on searchQuery hit", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    comp["_hideCompleted"] = false;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "bug";
    comp["_filterAssignee"] = "";

    const filtered = comp["_filteredTasks"] as TaskView[];
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Done bug");
  });

  // ─── 6. _completedCount ──────────────────────────────────────────────────

  it("_completedCount returns count of done + closed tasks", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;

    const count = comp["_completedCount"] as number;
    // sampleTasks has 1 done + 1 closed = 2
    expect(count).toBe(2);
  });

  it("_completedCount returns 0 when no tasks are done or closed", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [
      makeTask({ id: "t1", status: "open" }),
      makeTask({ id: "t2", status: "in_progress" }),
    ];

    const count = comp["_completedCount"] as number;
    expect(count).toBe(0);
  });

  // ─── 7. Batch selection ──────────────────────────────────────────────────

  it("_toggleSelect adds a task id to selection", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>();

    (comp["_toggleSelect"] as (id: string) => void).call(el, "task-1");

    const selected = comp["_selectedIds"] as Set<string>;
    expect(selected.has("task-1")).toBe(true);
  });

  it("_toggleSelect removes a task id that is already selected", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1"]);

    (comp["_toggleSelect"] as (id: string) => void).call(el, "task-1");

    const selected = comp["_selectedIds"] as Set<string>;
    expect(selected.has("task-1")).toBe(false);
  });

  it("_toggleSelect can select multiple tasks", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>();

    (comp["_toggleSelect"] as (id: string) => void).call(el, "task-1");
    (comp["_toggleSelect"] as (id: string) => void).call(el, "task-2");

    const selected = comp["_selectedIds"] as Set<string>;
    expect(selected.size).toBe(2);
    expect(selected.has("task-1")).toBe(true);
    expect(selected.has("task-2")).toBe(true);
  });

  it("_clearSelection empties the selection set", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1", "task-2"]);

    (comp["_clearSelection"] as () => void).call(el);

    const selected = comp["_selectedIds"] as Set<string>;
    expect(selected.size).toBe(0);
  });

  it("_toggleSelectMode enables selectMode and clears selection on disable", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectMode"] = false;
    comp["_selectedIds"] = new Set<string>();

    // Enable
    (comp["_toggleSelectMode"] as () => void).call(el);
    expect(comp["_selectMode"]).toBe(true);

    // Add a selection, then disable
    comp["_selectedIds"] = new Set<string>(["task-1"]);
    (comp["_toggleSelectMode"] as () => void).call(el);
    expect(comp["_selectMode"]).toBe(false);
    expect((comp["_selectedIds"] as Set<string>).size).toBe(0);
  });

  // ─── 8. Task selection / deselection ─────────────────────────────────────

  it("_selectTask sets _selectedTaskId", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    el.sessionCode = "";
    el.projectId = "";

    (comp["_selectTask"] as (id: string) => void).call(el, "task-1");

    expect(comp["_selectedTaskId"]).toBe("task-1");
  });

  it("_deselectTask clears _selectedTaskId", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [];
    comp["_selectedTaskId"] = "task-1";
    el.sessionCode = "";
    el.projectId = "";
    mockFetchProjectTasks.mockResolvedValue([]);

    (comp["_deselectTask"] as () => void).call(el);

    expect(comp["_selectedTaskId"]).toBeNull();
  });

  // ─── 9. Toast ────────────────────────────────────────────────────────────

  it("_showToast sets _toastMessage", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_showToast"] as (msg: string) => void).call(el, "Task moved!");

    expect(comp["_toastMessage"]).toBe("Task moved!");
  });

  it("_showToast clears _toastMessage after timeout", async () => {
    vi.useFakeTimers();
    const comp = el as unknown as Record<string, unknown>;

    (comp["_showToast"] as (msg: string) => void).call(el, "Task moved!");
    expect(comp["_toastMessage"]).toBe("Task moved!");

    vi.advanceTimersByTime(2600);
    expect(comp["_toastMessage"]).toBe("");

    vi.useRealTimers();
  });

  // ─── 10. Create dialog ───────────────────────────────────────────────────

  it("_openCreateDialog sets _showCreateDialog to true with defaults", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_openCreateDialog"] as () => void).call(el);

    expect(comp["_showCreateDialog"]).toBe(true);
    expect(comp["_createInitialType"]).toBe("task");
    expect(comp["_createInitialParentId"]).toBe("");
    expect(comp["_createInitialStatus"]).toBe("");
  });

  it("_openCreateDialog accepts parentId and type overrides", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_openCreateDialog"] as (parentId?: string, type?: string) => void).call(
      el,
      "parent-uuid",
      "subtask",
    );

    expect(comp["_showCreateDialog"]).toBe(true);
    expect(comp["_createInitialParentId"]).toBe("parent-uuid");
    expect(comp["_createInitialType"]).toBe("subtask");
  });

  it("_openCreateDialogWithStatus sets the initial status", () => {
    const comp = el as unknown as Record<string, unknown>;

    (comp["_openCreateDialogWithStatus"] as (status: string) => void).call(
      el,
      "in_progress",
    );

    expect(comp["_showCreateDialog"]).toBe(true);
    expect(comp["_createInitialStatus"]).toBe("in_progress");
  });

  // ─── 11. Group collapse ──────────────────────────────────────────────────

  it("_toggleGroup collapses an expanded group", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_collapsedGroups"] = new Set<string>();

    (comp["_toggleGroup"] as (id: string) => void).call(el, "parent-1");

    const collapsed = comp["_collapsedGroups"] as Set<string>;
    expect(collapsed.has("parent-1")).toBe(true);
  });

  it("_toggleGroup expands a collapsed group", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_collapsedGroups"] = new Set<string>(["parent-1"]);

    (comp["_toggleGroup"] as (id: string) => void).call(el, "parent-1");

    const collapsed = comp["_collapsedGroups"] as Set<string>;
    expect(collapsed.has("parent-1")).toBe(false);
  });

  // ─── 12. Filter change handler ───────────────────────────────────────────

  it("_handleFilterChanged updates searchQuery without reload", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_searchQuery"] = "";
    mockFetchProjectTasks.mockClear();

    const fakeEvent = {
      detail: { searchQuery: "fix login" },
    } as CustomEvent;
    (comp["_handleFilterChanged"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(comp["_searchQuery"]).toBe("fix login");
    // No reload needed for local filters
    expect(mockFetchProjectTasks).not.toHaveBeenCalled();
  });

  it("_handleFilterChanged updates hideCompleted without reload", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_hideCompleted"] = true;

    const fakeEvent = {
      detail: { hideCompleted: false },
    } as CustomEvent;
    (comp["_handleFilterChanged"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(comp["_hideCompleted"]).toBe(false);
  });

  it("_handleFilterChanged triggers reload when filterType changes", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    comp["_filterType"] = "";
    mockFetchProjectTasks.mockClear();
    mockFetchProjectTasks.mockResolvedValue([]);

    const fakeEvent = {
      detail: { filterType: "bug" },
    } as CustomEvent;
    (comp["_handleFilterChanged"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(comp["_filterType"]).toBe("bug");

    // Wait for the async _loadTasks triggered by needsReload
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetchProjectTasks).toHaveBeenCalled();
  });

  it("_handleFilterChanged triggers reload when filterStatus changes", async () => {
    el.projectId = "proj-1";
    el.sessionCode = "";
    const comp = el as unknown as Record<string, unknown>;
    comp["_filterStatus"] = "";
    mockFetchProjectTasks.mockClear();
    mockFetchProjectTasks.mockResolvedValue([]);

    const fakeEvent = {
      detail: { filterStatus: "in_progress" },
    } as CustomEvent;
    (comp["_handleFilterChanged"] as (e: CustomEvent) => void).call(
      el,
      fakeEvent,
    );

    expect(comp["_filterStatus"]).toBe("in_progress");

    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetchProjectTasks).toHaveBeenCalled();
  });

  // ─── 13. Empty state ─────────────────────────────────────────────────────

  it("starts with empty _tasks array", () => {
    const comp = el as unknown as Record<string, unknown>;
    expect(comp["_tasks"]).toEqual([]);
  });

  it("_completedCount is 0 with empty task list", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [];
    expect(comp["_completedCount"] as number).toBe(0);
  });

  it("_filteredTasks returns empty array when _tasks is empty", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [];
    comp["_hideCompleted"] = false;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "";
    comp["_filterAssignee"] = "";

    const filtered = comp["_filteredTasks"] as TaskView[];
    expect(filtered).toHaveLength(0);
  });

  // ─── 14. _batchSetStatus ─────────────────────────────────────────────────

  it("_batchSetStatus does nothing when no tasks are selected", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>();
    mockUpdateTask.mockClear();

    await (comp["_batchSetStatus"] as (status: string) => Promise<void>).call(
      el,
      "done",
    );

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it("_batchSetStatus calls updateTask for each selected id", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1", "task-2"]);
    comp["_tasks"] = [];
    mockUpdateTask.mockResolvedValue({});
    mockFetchTasks.mockResolvedValue([]);

    await (comp["_batchSetStatus"] as (status: string) => Promise<void>).call(
      el,
      "in_progress",
    );

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", { status: "in_progress" });
    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-2", { status: "in_progress" });
    expect((comp["_selectedIds"] as Set<string>).size).toBe(0);
  });

  it("_batchSetStatus sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1"]);
    mockUpdateTask.mockRejectedValueOnce(new Error("Update failed"));

    await (comp["_batchSetStatus"] as (status: string) => Promise<void>).call(
      el,
      "done",
    );

    expect(comp["_error"]).toBe("Update failed");
    expect(comp["_batchLoading"]).toBe(false);
  });

  // ─── 15. _batchDelete ────────────────────────────────────────────────────

  it("_batchDelete does nothing when no tasks are selected", async () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>();
    mockDeleteTask.mockClear();

    await (comp["_batchDelete"] as () => Promise<void>).call(el);

    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it("_batchDelete calls deleteTask for each selected id", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1", "task-2"]);
    comp["_tasks"] = [];
    mockDeleteTask.mockResolvedValue({});
    mockFetchTasks.mockResolvedValue([]);

    await (comp["_batchDelete"] as () => Promise<void>).call(el);

    expect(mockDeleteTask).toHaveBeenCalledWith("SES1", "task-1");
    expect(mockDeleteTask).toHaveBeenCalledWith("SES1", "task-2");
    expect((comp["_selectedIds"] as Set<string>).size).toBe(0);
  });

  it("_batchDelete sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1"]);
    mockDeleteTask.mockRejectedValueOnce(new Error("Delete failed"));

    await (comp["_batchDelete"] as () => Promise<void>).call(el);

    expect(comp["_error"]).toBe("Delete failed");
    expect(comp["_batchLoading"]).toBe(false);
  });

  // ─── 16. _handleStatusChange ─────────────────────────────────────────────

  it("_handleStatusChange calls updateTask with new status", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTask({ id: "task-1" });
    comp["_tasks"] = [task];
    mockUpdateTask.mockResolvedValue({});
    mockFetchTasks.mockResolvedValue([task]);

    await (
      comp["_handleStatusChange"] as (
        task: TaskView,
        status: string,
      ) => Promise<void>
    ).call(el, task, "done");

    expect(mockUpdateTask).toHaveBeenCalledWith("SES1", "task-1", { status: "done" });
  });

  it("_handleStatusChange sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    const task = makeTask({ id: "task-1" });
    mockUpdateTask.mockRejectedValueOnce(new Error("Status update failed"));

    await (
      comp["_handleStatusChange"] as (
        task: TaskView,
        status: string,
      ) => Promise<void>
    ).call(el, task, "done");

    expect(comp["_error"]).toBe("Status update failed");
  });

  // ─── 17. _handleDelete ───────────────────────────────────────────────────

  it("_handleDelete calls deleteTask with the task id", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [];
    mockDeleteTask.mockResolvedValue({});
    mockFetchTasks.mockResolvedValue([]);

    await (comp["_handleDelete"] as (id: string) => Promise<void>).call(
      el,
      "task-abc",
    );

    expect(mockDeleteTask).toHaveBeenCalledWith("SES1", "task-abc");
  });

  it("_handleDelete deselects task if the deleted task was selected", async () => {
    el.sessionCode = "";
    el.projectId = "";
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedTaskId"] = "task-abc";
    comp["_tasks"] = [];
    mockDeleteTask.mockResolvedValue({});
    mockFetchProjectTasks.mockResolvedValue([]);

    await (comp["_handleDelete"] as (id: string) => Promise<void>).call(
      el,
      "task-abc",
    );

    expect(comp["_selectedTaskId"]).toBeNull();
  });

  it("_handleDelete sets _error on failure", async () => {
    el.sessionCode = "SES1";
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = [];
    mockDeleteTask.mockRejectedValueOnce(new Error("Delete error"));

    await (comp["_handleDelete"] as (id: string) => Promise<void>).call(
      el,
      "task-abc",
    );

    expect(comp["_error"]).toBe("Delete error");
  });

  // ─── 18. Kanban column grouping logic ─────────────────────────────────────

  it("tasks sort into the correct status buckets", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_tasks"] = sampleTasks;
    comp["_hideCompleted"] = false;
    comp["_filterStatus"] = "";
    comp["_searchQuery"] = "";
    comp["_filterAssignee"] = "";

    const filtered = comp["_filteredTasks"] as TaskView[];
    const openTasks = filtered.filter((t) => t.status === "open");
    const inProgressTasks = filtered.filter((t) => t.status === "in_progress");
    const doneTasks = filtered.filter((t) => t.status === "done");
    const closedTasks = filtered.filter((t) => t.status === "closed");

    expect(openTasks).toHaveLength(1);
    expect(inProgressTasks).toHaveLength(1);
    expect(doneTasks).toHaveLength(1);
    expect(closedTasks).toHaveLength(1);
  });

  // ─── 19. Keyboard shortcut handler ───────────────────────────────────────

  it("Escape key clears selection when tasks are selected", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_selectedIds"] = new Set<string>(["task-1"]);
    comp["_selectMode"] = false;
    comp["_selectedTaskId"] = null;
    comp["_showShortcuts"] = false;

    const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(escapeEvent, "composedPath", { value: () => [] });
    document.dispatchEvent(escapeEvent);

    const selected = comp["_selectedIds"] as Set<string>;
    expect(selected.size).toBe(0);
    expect(comp["_selectMode"]).toBe(false);
  });

  it("Escape key closes shortcuts dialog when open", () => {
    const comp = el as unknown as Record<string, unknown>;
    comp["_showShortcuts"] = true;
    comp["_selectedIds"] = new Set<string>();
    comp["_selectMode"] = false;
    comp["_selectedTaskId"] = null;

    const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(escapeEvent, "composedPath", { value: () => [] });
    document.dispatchEvent(escapeEvent);

    expect(comp["_showShortcuts"]).toBe(false);
  });
});
