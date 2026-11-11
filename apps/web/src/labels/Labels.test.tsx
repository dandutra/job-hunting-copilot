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

function stub(doneAt = 10) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let id = 1;
  let stored = 0;
  const client = {
    GET: vi.fn(async (path: string) => {
      calls.push({ method: "GET", path });
      return { data: posting(id), response: { status: 200 } };
    }),
    POST: vi.fn(async (path: string, init: { body: unknown }) => {
      calls.push({ method: "POST", path, body: init.body });
      id++;
      stored++;
      return { data: { id, batchDone: stored >= doneAt } };
    }),
    DELETE: vi.fn(async (path: string) => {
      calls.push({ method: "DELETE", path });
      id--;
      stored--;
      return { response: { status: 204 } };
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
  const s = stub(2);
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
