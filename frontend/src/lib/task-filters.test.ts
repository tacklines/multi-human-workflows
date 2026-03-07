import { describe, it, expect } from "vitest";
import type { TaskView } from "../state/task-types.js";
import {
  filterTasks,
  sortTasks,
  completedCount,
  childrenOf,
  childProgress,
} from "./task-filters.js";

function makeTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "t-1",
    session_id: null,
    project_id: "proj-1",
    ticket_number: 1,
    ticket_id: "SEAM-1",
    parent_id: null,
    task_type: "task",
    title: "Default task",
    description: null,
    status: "open",
    priority: "medium",
    complexity: "medium",
    assigned_to: null,
    created_by: "user-1",
    commit_hashes: [],
    no_code_change: false,
    session_ids: [],
    source_task_id: null,
    model_hint: null,
    budget_tier: null,
    provider: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    child_count: 0,
    comment_count: 0,
    ...overrides,
  };
}

describe("filterTasks", () => {
  const tasks = [
    makeTask({ id: "1", title: "Open task", status: "open" }),
    makeTask({ id: "2", title: "Done task", status: "done" }),
    makeTask({ id: "3", title: "Closed task", status: "closed" }),
    makeTask({
      id: "4",
      title: "In progress",
      status: "in_progress",
      assigned_to: "user-a",
    }),
  ];

  const defaultFilters = {
    hideCompleted: false,
    filterStatus: "" as const,
    searchQuery: "",
    filterAssignee: "",
  };

  it("returns all tasks with no filters", () => {
    expect(filterTasks(tasks, defaultFilters)).toHaveLength(4);
  });

  it("hides completed when hideCompleted is true", () => {
    const result = filterTasks(tasks, { ...defaultFilters, hideCompleted: true });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status !== "done" && t.status !== "closed")).toBe(true);
  });

  it("does not hide completed when filterStatus is set", () => {
    const result = filterTasks(tasks, {
      ...defaultFilters,
      hideCompleted: true,
      filterStatus: "done",
    });
    // filterStatus being set disables hideCompleted filter
    expect(result).toHaveLength(4);
  });

  it("filters by search query in title", () => {
    const result = filterTasks(tasks, { ...defaultFilters, searchQuery: "progress" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("filters by search query in ticket_id", () => {
    const withTicket = [
      makeTask({ id: "x", ticket_id: "BUG-42", title: "Something" }),
    ];
    const result = filterTasks(withTicket, { ...defaultFilters, searchQuery: "bug-42" });
    expect(result).toHaveLength(1);
  });

  it("filters by search query in description", () => {
    const withDesc = [
      makeTask({ id: "d", title: "Foo", description: "Fix the widget" }),
    ];
    const result = filterTasks(withDesc, { ...defaultFilters, searchQuery: "widget" });
    expect(result).toHaveLength(1);
  });

  it("filters by assignee", () => {
    const result = filterTasks(tasks, { ...defaultFilters, filterAssignee: "user-a" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("combines multiple filters", () => {
    const result = filterTasks(tasks, {
      hideCompleted: true,
      filterStatus: "" as const,
      searchQuery: "progress",
      filterAssignee: "user-a",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("does not mutate the input array", () => {
    const original = [...tasks];
    filterTasks(tasks, { ...defaultFilters, hideCompleted: true });
    expect(tasks).toEqual(original);
  });
});

describe("sortTasks", () => {
  const tasks = [
    makeTask({ id: "a", title: "Banana", task_type: "bug", created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }),
    makeTask({ id: "b", title: "Apple", task_type: "epic", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" }),
    makeTask({ id: "c", title: "Cherry", task_type: "task", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }),
  ];

  it("sorts by created (newest first)", () => {
    const result = sortTasks(tasks, "created");
    expect(result.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by updated (newest first)", () => {
    const result = sortTasks(tasks, "updated");
    expect(result.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by title alphabetically", () => {
    const result = sortTasks(tasks, "title");
    expect(result.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by type alphabetically", () => {
    const result = sortTasks(tasks, "type");
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const original = [...tasks];
    sortTasks(tasks, "title");
    expect(tasks).toEqual(original);
  });
});

describe("completedCount", () => {
  it("counts done and closed tasks", () => {
    const tasks = [
      makeTask({ status: "open" }),
      makeTask({ status: "done" }),
      makeTask({ status: "closed" }),
      makeTask({ status: "in_progress" }),
    ];
    expect(completedCount(tasks)).toBe(2);
  });

  it("returns 0 for empty array", () => {
    expect(completedCount([])).toBe(0);
  });
});

describe("childrenOf", () => {
  it("returns direct children of a parent", () => {
    const tasks = [
      makeTask({ id: "parent", parent_id: null }),
      makeTask({ id: "child-1", parent_id: "parent" }),
      makeTask({ id: "child-2", parent_id: "parent" }),
      makeTask({ id: "unrelated", parent_id: "other" }),
    ];
    const children = childrenOf(tasks, "parent");
    expect(children).toHaveLength(2);
    expect(children.map((t) => t.id)).toEqual(["child-1", "child-2"]);
  });

  it("returns empty array when no children", () => {
    expect(childrenOf([makeTask({ id: "solo" })], "solo")).toEqual([]);
  });
});

describe("childProgress", () => {
  it("returns [completed, total] for children", () => {
    const tasks = [
      makeTask({ id: "parent" }),
      makeTask({ id: "c1", parent_id: "parent", status: "done" }),
      makeTask({ id: "c2", parent_id: "parent", status: "open" }),
      makeTask({ id: "c3", parent_id: "parent", status: "closed" }),
    ];
    expect(childProgress(tasks, "parent")).toEqual([2, 3]);
  });

  it("returns [0, 0] when no children", () => {
    expect(childProgress([], "none")).toEqual([0, 0]);
  });
});
