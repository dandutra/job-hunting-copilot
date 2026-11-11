import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { ApiProvider } from "../api/ApiContext";
import type { ApiClient } from "../api/client";

afterEach(cleanup);

const posting = (id: number) => ({
  postingId: id,
  title: `Role ${id}`,
  company: `Co ${id}`,
  location: "Toronto, ON",
  text: `Body ${id}`,
});

interface Faults {
  doneAt?: number;
  // HTTP status for the nth GET (0-based) or the nth POST.
  getStatus?: Record<number, number>;
  postStatus?: Record<number, number>;
}

function stub({ doneAt = 10, getStatus = {}, postStatus = {} }: Faults = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 1;
  let stored = 0;
  let gets = 0;
  let posts = 0;
  const client = {
    GET: vi.fn(async (path: string) => {
      calls.push({ method: "GET", path });
      const status = getStatus[gets++];
      if (status) return { error: {}, response: { status, ok: false } };
      return { data: posting(id), response: { status: 200, ok: true } };
    }),
    POST: vi.fn(async (path: string, init: { body: unknown }) => {
      calls.push({ method: "POST", path, body: init.body });
      const status = postStatus[posts++];
      if (status) return { error: {}, response: { status, ok: false } };
      id++;
      stored++;
      return { data: { id, batchDone: stored >= doneAt } };
    }),
    DELETE: vi.fn(async (path: string) => {
      calls.push({ method: "DELETE", path });
      id--;
      stored--;
      return { response: { status: 204, ok: true } };
    }),
  } as unknown as ApiClient;
  return { client, calls };
}

function renderLabels(s: ReturnType<typeof stub>) {
  return render(
    <ApiProvider client={s.client}>
      <MemoryRouter initialEntries={["/labels"]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

it("posts A, B, C and cant_tell for keys 1 to 4", async () => {
  const s = stub();
  renderLabels(s);
  for (const [i, key] of ["1", "2", "3", "4"].entries()) {
    await screen.findByText(`Role ${i + 1}`);
    fireEvent.keyDown(window, { key });
    await screen.findByText(`Role ${i + 2}`);
  }

  const posts = s.calls.filter((c) => c.method === "POST");
  expect(posts.map((p) => p.body)).toEqual([
    { postingId: 1, label: "A" },
    { postingId: 2, label: "B" },
    { postingId: 3, label: "C" },
    { postingId: 4, label: "cant_tell" },
  ]);
});

it("undoes only the last Label, and not before one is answered", async () => {
  const s = stub();
  renderLabels(s);
  await screen.findByText("Role 1");
  fireEvent.keyDown(window, { key: "u" });
  expect(s.calls.some((c) => c.method === "DELETE")).toBe(false);

  fireEvent.keyDown(window, { key: "1" });
  await screen.findByText("Role 2");
  fireEvent.keyDown(window, { key: "u" });
  await screen.findByText("Role 1");

  expect(s.calls.filter((c) => c.method === "DELETE")).toEqual([
    { method: "DELETE", path: "/label-queue/labels/last" },
  ]);
  expect(screen.getByText("0 of 10")).toBeTruthy();
});

it("shows a done screen with the count after the batch is stored", async () => {
  const s = stub({ doneAt: 2 });
  renderLabels(s);
  await screen.findByText("Role 1");
  fireEvent.keyDown(window, { key: "1" });
  await screen.findByText("Role 2");
  fireEvent.keyDown(window, { key: "2" });

  await screen.findByText("Batch done");
  expect(screen.getByText(/2 Labels stored in/)).toBeTruthy();
});

it("renders no Tier letter, color class or Tier word", async () => {
  const s = stub();
  const { container } = renderLabels(s);
  await screen.findByText("Role 1");

  expect(container.innerHTML).not.toMatch(/tier/i);
  expect(container.querySelector("[class*='tier']")).toBeNull();
});

it("undoes from the Undo link as well as the u key", async () => {
  const s = stub();
  renderLabels(s);
  await screen.findByText("Role 1");
  fireEvent.click(
    screen.getByRole("button", { name: "1 A: Tailor and apply on sight" }),
  );
  await screen.findByText("Role 2");

  fireEvent.click(screen.getByRole("button", { name: "Undo (u)" }));

  await screen.findByText("Role 1");
  expect(s.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
});

it("refetches the card and says nothing was stored when a post gets 409", async () => {
  const s = stub({ postStatus: { 0: 409 } });
  renderLabels(s);
  await screen.findByText("Role 1");

  fireEvent.keyDown(window, { key: "1" });

  await screen.findByText(/nothing was stored/);
  expect(s.calls.filter((c) => c.method === "GET")).toHaveLength(2);
  expect(screen.getByText("0 of 10")).toBeTruthy();
});

it("shows an error, not the done screen, when next fails mid-batch", async () => {
  const s = stub({ getStatus: { 1: 500 } });
  renderLabels(s);
  await screen.findByText("Role 1");

  fireEvent.keyDown(window, { key: "1" });

  await screen.findByText("The queue did not answer (HTTP 500).");
  expect(screen.queryByText("Batch done")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Role 2");
});

it("does not call a batch done when next answers 204 mid-batch", async () => {
  const s = stub({ getStatus: { 1: 204 } });
  renderLabels(s);
  await screen.findByText("Role 1");
  fireEvent.keyDown(window, { key: "1" });

  await screen.findByText("Nothing to label right now.");
  expect(screen.queryByText("Batch done")).toBeNull();
  expect(screen.getByText(/1 Label stored this session/)).toBeTruthy();
});

it("keeps the nothing-stored notice when a 409 ends the phase", async () => {
  const s = stub({ getStatus: { 1: 204 }, postStatus: { 0: 409 } });
  renderLabels(s);
  await screen.findByText("Role 1");
  fireEvent.keyDown(window, { key: "1" });

  await screen.findByText("Nothing to label right now.");
  expect(screen.getByRole("alert").textContent).toMatch(/nothing was stored/);
  expect(screen.queryByText("Batch done")).toBeNull();
});
