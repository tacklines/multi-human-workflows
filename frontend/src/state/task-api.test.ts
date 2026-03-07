import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./auth-state.js", () => ({
  authStore: {
    getAccessToken: vi.fn().mockReturnValue("test-token"),
  },
}));

import {
  fetchTasks,
  fetchProjectTasks,
  fetchTask,
  createTask,
  updateTask,
  deleteTask,
  addDependency,
  removeDependency,
  addTasksToSession,
  removeTaskFromSession,
  fetchDependencyGraph,
  fetchActivity,
  addComment,
} from "./task-api.js";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(ok ? "" : String(body)),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTasks", () => {
  it("GETs /api/sessions/:code/tasks with auth", async () => {
    const spy = mockFetch([]);
    globalThis.fetch = spy;

    await fetchTasks("ABC123");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC123/tasks");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
  });

  it("appends filter params to URL", async () => {
    const spy = mockFetch([]);
    globalThis.fetch = spy;

    await fetchTasks("ABC", { task_type: "bug", status: "open", session_only: false });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("task_type=bug");
    expect(url).toContain("status=open");
    expect(url).toContain("session_only=false");
  });

  it("omits undefined filter params", async () => {
    const spy = mockFetch([]);
    globalThis.fetch = spy;

    await fetchTasks("ABC", { task_type: "task" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("task_type=task");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("parent_id=");
  });
});

describe("fetchProjectTasks", () => {
  it("GETs /api/projects/:id/tasks", async () => {
    const spy = mockFetch([]);
    globalThis.fetch = spy;

    await fetchProjectTasks("proj-1");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe("/api/projects/proj-1/tasks");
  });
});

describe("fetchTask", () => {
  it("GETs /api/sessions/:code/tasks/:id", async () => {
    const spy = mockFetch({ id: "t-1" });
    globalThis.fetch = spy;

    await fetchTask("ABC", "t-1");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe("/api/sessions/ABC/tasks/t-1");
  });
});

describe("createTask", () => {
  it("POSTs task data", async () => {
    const spy = mockFetch({ id: "t-new" });
    globalThis.fetch = spy;

    await createTask("ABC", { task_type: "bug", title: "Fix crash" });

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toMatchObject({
      task_type: "bug",
      title: "Fix crash",
    });
  });
});

describe("updateTask", () => {
  it("PATCHes task fields", async () => {
    const spy = mockFetch({ id: "t-1" });
    globalThis.fetch = spy;

    await updateTask("ABC", "t-1", { status: "done", title: "Updated" });

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/t-1");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body as string)).toEqual({
      status: "done",
      title: "Updated",
    });
  });
});

describe("deleteTask", () => {
  it("DELETEs the task", async () => {
    const spy = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 });
    globalThis.fetch = spy;

    await deleteTask("ABC", "t-1");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/t-1");
    expect(opts.method).toBe("DELETE");
  });

  it("throws on failure", async () => {
    const spy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });
    globalThis.fetch = spy;

    await expect(deleteTask("ABC", "t-1")).rejects.toThrow("Not found");
  });
});

describe("addDependency", () => {
  it("POSTs dependency", async () => {
    const spy = mockFetch({});
    globalThis.fetch = spy;

    await addDependency("ABC", "blocker-1", "blocked-1");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/blocker-1/dependencies");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ blocked_id: "blocked-1" });
  });
});

describe("removeDependency", () => {
  it("DELETEs dependency", async () => {
    const spy = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 });
    globalThis.fetch = spy;

    await removeDependency("ABC", "blocker-1", "blocked-1");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/blocker-1/dependencies/blocked-1");
    expect(opts.method).toBe("DELETE");
  });
});

describe("addTasksToSession", () => {
  it("POSTs task IDs", async () => {
    const spy = mockFetch({ added: 2 });
    globalThis.fetch = spy;

    const result = await addTasksToSession("ABC", ["t-1", "t-2"]);

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/add");
    expect(JSON.parse(opts.body as string)).toEqual({ task_ids: ["t-1", "t-2"] });
    expect(result.added).toBe(2);
  });
});

describe("removeTaskFromSession", () => {
  it("DELETEs membership", async () => {
    const spy = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 });
    globalThis.fetch = spy;

    await removeTaskFromSession("ABC", "t-1");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/t-1/membership");
    expect(opts.method).toBe("DELETE");
  });
});

describe("fetchDependencyGraph", () => {
  it("GETs /api/projects/:id/graph", async () => {
    const spy = mockFetch({ tasks: [], edges: [], provenance: [] });
    globalThis.fetch = spy;

    const result = await fetchDependencyGraph("proj-1");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe("/api/projects/proj-1/graph");
    expect(result.tasks).toEqual([]);
  });
});

describe("fetchActivity", () => {
  it("GETs activity with query params", async () => {
    const spy = mockFetch([]);
    globalThis.fetch = spy;

    await fetchActivity("ABC", { limit: 10, target_id: "t-1" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/sessions/ABC/activity");
    expect(url).toContain("limit=10");
    expect(url).toContain("target_id=t-1");
  });
});

describe("addComment", () => {
  it("POSTs comment content", async () => {
    const spy = mockFetch({ id: "c-1", content: "Hello" });
    globalThis.fetch = spy;

    const result = await addComment("ABC", "t-1", "Hello");

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/ABC/tasks/t-1/comments");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ content: "Hello" });
    expect(result.content).toBe("Hello");
  });
});
