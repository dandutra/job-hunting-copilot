import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { ApiProvider } from "../api/ApiContext";
import type { ApiClient } from "../api/client";
import type { components } from "../api/schema";

afterEach(cleanup);

type Resume = components["schemas"]["TailoredResumeDto"];
type Drafts = components["schemas"]["PostingDraftsDto"];

type Cite = components["schemas"]["CitedEntryDto"];

const cite = (id: string, text: string, over: Partial<Cite> = {}): Cite => ({
  id,
  text,
  ownership: "solo",
  sources: ["resume 2024"],
  ...over,
});

const resume = (over: Partial<Resume> = {}): Resume => ({
  id: 7,
  postingId: 3,
  status: "draft",
  profileVersion: "abcdef1234567890",
  createdAt: "2026-11-18T12:00:00.000Z",
  approvedAt: null,
  contact: {
    name: "Sam Sample",
    city: "Exampleton",
    email: "sam@example.com",
    phone: "416-555-0100",
    links: [],
  },
  summary: [
    {
      line: "summary[0]",
      text: "Led a team of five.",
      cites: [
        cite("F2", "Shipped weekly with a team of five.", {
          ownership: "team",
          ownershipNote: "Wrote the release script.",
        }),
      ],
    },
  ],
  experiences: [
    {
      id: "E1",
      employer: "Northwind Example Inc.",
      titles: ["Developer"],
      start: "2022-01",
      location: "Exampleton",
      fixed: false,
      bullets: [
        {
          line: "experiences[0].bullets[0]",
          text: "Built a nightly report.",
          cites: [cite("F1", "Built a nightly report.")],
        },
        {
          line: "experiences[0].bullets[1]",
          text: "Cut the report time by half.",
          cites: [cite("F4", "Report runs faster.")],
        },
      ],
    },
  ],
  projects: [
    {
      id: "P1",
      name: "Widget Tool",
      links: [],
      bullets: [
        {
          line: "projects[0].bullets[0]",
          text: "Wrote a command line tool.",
          cites: [cite("F3", "Wrote a small command line tool.")],
        },
      ],
    },
  ],
  education: [
    {
      id: "D1",
      school: "Example University",
      program: "BSc",
      start: "2016-09",
    },
  ],
  skills: [{ skillId: "S1", text: "TypeScript" }],
  doNotClaims: [{ id: "X1", text: "Never claim to have led the team." }],
  coverLetter: {
    greeting: "Dear Acme Example hiring team,",
    paragraphs: [
      {
        line: "coverLetter[0]",
        text: "I build reports.",
        cites: [cite("F1", "Built a nightly report.")],
      },
    ],
    signOff: "Sincerely,\nSam Sample",
  },
  verdicts: [
    { line: "summary[0]", status: "do-not-claim", doNotClaimId: "X1" },
    { line: "experiences[0].bullets[0]", status: "pass" },
    {
      line: "experiences[0].bullets[1]",
      status: "overstatement",
      note: "Says half; the Fact gives no number.",
    },
    { line: "projects[0].bullets[0]", status: "pass" },
    { line: "coverLetter[0]", status: "pass" },
  ],
  ...over,
});

const drafts = (over: Partial<Drafts> = {}): Drafts => ({
  ats: "greenhouse",
  uploadFormat: "pdf",
  drafts: [
    {
      id: 5,
      status: "superseded",
      createdAt: "2026-11-17T12:00:00.000Z",
      approvedAt: null,
    },
    {
      id: 7,
      status: "draft",
      createdAt: "2026-11-18T12:00:00.000Z",
      approvedAt: null,
    },
  ],
  ...over,
});

interface Init {
  params?: { path?: { id: number } };
  body?: unknown;
}

function stub(
  opts: {
    resume?: Resume;
    drafts?: Drafts;
    pastedText?: string | null;
    approve?: () => { data?: unknown; error?: unknown };
    reject?: () => { data?: unknown; error?: unknown };
  } = {},
) {
  let current = opts.resume ?? resume();
  const calls: { method: string; path: string; init?: Init }[] = [];
  const call = async (method: string, path: string, init?: Init) => {
    calls.push({ method, path, init });
    if (path === "/tailored-resumes/{id}") return { data: current };
    if (path === "/postings/{id}")
      return {
        data: { id: 3, title: "Developer", company: "Acme Example" },
      };
    if (path === "/postings/{id}/tailored-resumes")
      return { data: opts.drafts ?? drafts() };
    if (path === "/tailored-resumes/{id}/posting-text")
      return { data: { text: opts.pastedText ?? null } };
    if (path === "/tailored-resumes/{id}/approve") {
      const out = opts.approve?.() ?? { data: { id: 7, status: "approved" } };
      if (out.data)
        current = { ...current, status: "approved", approvedAt: "2026-11-19" };
      return out;
    }
    if (path === "/tailored-resumes/{id}/reject") {
      const out = opts.reject?.() ?? { data: { id: 7, status: "rejected" } };
      if (out.data) {
        const body = init?.body as { note: string; lines: never[] };
        current = {
          ...current,
          status: "rejected",
          rejectNote: body.note,
          rejectLines: body.lines,
        };
      }
      return out;
    }
    return { error: {}, response: { status: 404 } };
  };
  const client = {
    GET: vi.fn((p: string, i?: Init) => call("GET", p, i)),
    POST: vi.fn((p: string, i?: Init) => call("POST", p, i)),
  } as unknown as ApiClient;
  return { client, calls };
}

function renderReview(s: ReturnType<typeof stub>, path = "/resumes/7") {
  return render(
    <ApiProvider client={s.client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

const inspector = () => within(screen.getByRole("complementary"));

it("heads the screen with the draft number, profile version, Trace check and Claim review counts", async () => {
  renderReview(stub());

  await screen.findByRole("heading", {
    name: "Tailored resume for Developer, Acme Example",
  });
  const header = screen.getByRole("region", { name: "Draft status" });
  expect(header.textContent).toContain("Draft 2");
  expect(header.textContent).toContain("profile abcdef12");
  expect(header.textContent).toContain("Trace check passed");
  expect(header.textContent).toContain(
    "Claim review: 5 lines read, 3 passed, 2 flagged",
  );
});

it("lays the resume out as it will read, with the cover letter below and flagged lines marked", async () => {
  renderReview(stub());
  await screen.findByText("Sam Sample");

  const paper = within(screen.getByRole("article"));
  const headings = paper.getAllByRole("heading").map((h) => h.textContent);
  expect(headings).toEqual([
    "Sam Sample",
    "Highlights of Qualifications",
    "Experience",
    "Projects",
    "Education",
    "Skills",
    "Cover letter",
  ]);
  const flagged = (text: string) =>
    paper.getByRole("button", { name: new RegExp(text) }).className;
  expect(flagged("Led a team")).toContain("flagged");
  expect(flagged("Cut the report time")).toContain("flagged");
  expect(flagged("Built a nightly report")).not.toContain("flagged");
  expect(
    paper.getByRole("button", { name: /Led a team/ }).textContent,
  ).toContain("Flagged");
});

it("opens the inspector on the first flagged line with its verdict and cited Fact", async () => {
  renderReview(stub());
  await screen.findByText("Sam Sample");

  const i = inspector();
  expect(i.getByText("Led a team of five.")).toBeTruthy();
  expect(i.getByText("Breaks X1")).toBeTruthy();
  expect(i.getByText("Never claim to have led the team.")).toBeTruthy();
  const factText = i.getByText("Shipped weekly with a team of five.");
  const fact = factText.closest("div")!;
  expect(fact.textContent).toContain("F2");
  expect(fact.textContent).toContain("team");
  expect(fact.textContent).toContain("Wrote the release script.");
  expect(fact.textContent).toContain("resume 2024");
});

const pressed = () =>
  screen
    .getAllByRole("button", { pressed: true })
    .map((b) => b.textContent?.replace(/^!?Flagged /, ""));

it("steps through every line with Prev and Next, and selects a line by clicking it", async () => {
  renderReview(stub());
  await screen.findByText("Sam Sample");
  expect(pressed()).toEqual(["Led a team of five."]);

  fireEvent.click(inspector().getByRole("button", { name: /Next/ }));
  expect(pressed()).toEqual(["Built a nightly report."]);
  fireEvent.click(inspector().getByRole("button", { name: /Next/ }));
  expect(pressed()).toEqual(["Cut the report time by half."]);
  expect(inspector().getByText(/Says half/)).toBeTruthy();
  fireEvent.click(inspector().getByRole("button", { name: /Prev/ }));
  fireEvent.click(inspector().getByRole("button", { name: /Prev/ }));
  expect(pressed()).toEqual(["Led a team of five."]);
  // Prev from the first line wraps to the last, the cover letter's paragraph.
  fireEvent.click(inspector().getByRole("button", { name: /Prev/ }));
  expect(pressed()).toEqual(["I build reports."]);

  fireEvent.click(screen.getByRole("button", { name: /Wrote a command line/ }));
  expect(pressed()).toEqual(["Wrote a command line tool."]);
});

it("lists the Do-not-claims and the pasted Posting text, or says there is none", async () => {
  const withText = renderReview(stub({ pastedText: "Pasted job text." }));
  await screen.findByText("Pasted job text.");
  expect(
    inspector().getAllByText("Never claim to have led the team.").length,
  ).toBeGreaterThan(0);
  withText.unmount();

  renderReview(stub());
  await screen.findByText(/No pasted text/);
});

it("says so when the Claim review has not run", async () => {
  renderReview(stub({ resume: resume({ verdicts: undefined }) }));

  await screen.findByText("Sam Sample");
  expect(
    screen.getByRole("region", { name: "Draft status" }).textContent,
  ).toContain("Claim review: not run");
});

const linkHrefs = () =>
  screen
    .getAllByRole("link")
    .filter((a) => a.hasAttribute("download"))
    .map((a) => [a.textContent, a.getAttribute("href")]);

it("approves through the API, then offers each file and names the one to upload", async () => {
  const s = stub();
  renderReview(s);
  await screen.findByText("Sam Sample");
  expect(screen.queryByRole("link", { name: /PDF/ })).toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: "Approve resume and cover letter" }),
  );

  await screen.findByText("Approved.");
  expect(s.calls).toContainEqual({
    method: "POST",
    path: "/tailored-resumes/{id}/approve",
    init: { params: { path: { id: 7 } } },
  });
  expect(linkHrefs()).toEqual([
    ["Resume PDF", "/api/tailored-resumes/7/files/resume.pdf"],
    ["Resume DOCX", "/api/tailored-resumes/7/files/resume.docx"],
    ["Cover letter PDF", "/api/tailored-resumes/7/files/cover-letter.pdf"],
    ["Cover letter DOCX", "/api/tailored-resumes/7/files/cover-letter.docx"],
  ]);
  const hint = screen.getByText(/upload the/);
  expect(hint.textContent).toContain("greenhouse");
  expect(hint.textContent).toContain("PDF");
});

it("takes the format to upload from the API, so a Workday Posting says DOCX", async () => {
  renderReview(
    stub({
      resume: resume({ status: "approved", approvedAt: "2026-11-19" }),
      drafts: drafts({ ats: "workday", uploadFormat: "docx" }),
    }),
  );

  await screen.findByText("Approved.");
  const hint = screen.getByText(/upload the/);
  expect(hint.textContent).toContain("workday");
  expect(hint.textContent).toContain("DOCX");
});

it("offers no cover letter file for a draft without a cover letter", async () => {
  renderReview(
    stub({
      resume: resume({
        status: "approved",
        approvedAt: "2026-11-19",
        coverLetter: undefined,
      }),
    }),
  );

  await screen.findByText("Approved.");
  expect(linkHrefs().map(([label]) => label)).toEqual([
    "Resume PDF",
    "Resume DOCX",
  ]);
});

it("keeps the files of a superseded approved draft reachable", async () => {
  renderReview(
    stub({
      resume: resume({ status: "superseded", approvedAt: "2026-11-10" }),
    }),
  );

  await screen.findByText("Approved, since superseded.");
  expect(linkHrefs()).toHaveLength(4);
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
});

it("says why an approve failed and leaves the draft open", async () => {
  const failures = [{ rule: "1", location: "summary[0]", detail: "x" }];
  let status = 422;
  const s = stub({
    approve: () => ({ error: { failures }, response: { status } }) as never,
  });
  renderReview(s);
  await screen.findByText("Sam Sample");

  fireEvent.click(
    screen.getByRole("button", { name: "Approve resume and cover letter" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Trace check failed on 1 lines",
  );
  expect(screen.queryByRole("link", { name: /PDF/ })).toBeNull();

  status = 500;
  fireEvent.click(
    screen.getByRole("button", { name: "Approve resume and cover letter" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be rendered",
    ),
  );
});

it("rejects with a note and the faulty lines, each naming a Do-not-claim", async () => {
  const s = stub();
  renderReview(s);
  await screen.findByText("Sam Sample");

  fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
  const send = screen.getByRole("button", { name: "Send rejection" });
  expect((send as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByRole("checkbox", { name: /summary\[0\]/ }));
  fireEvent.change(screen.getByLabelText("Do-not-claim broken by summary[0]"), {
    target: { value: "X1" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /experiences\[0\]\.bullets\[1\]/ }),
  );
  fireEvent.change(screen.getByLabelText("Why is this draft rejected?"), {
    target: { value: "The lead claim is wrong." },
  });
  expect((send as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(send);

  await screen.findByText("Rejected.");
  expect(
    s.calls.find((c) => c.path === "/tailored-resumes/{id}/reject")?.init,
  ).toEqual({
    params: { path: { id: 7 } },
    body: {
      note: "The lead claim is wrong.",
      lines: [
        { line: "summary[0]", doNotClaimId: "X1" },
        { line: "experiences[0].bullets[1]" },
      ],
    },
  });
  expect(screen.getByText(/The lead claim is wrong/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
});

it("cancels a rejection without sending anything", async () => {
  const s = stub();
  renderReview(s);
  await screen.findByText("Sam Sample");

  fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByRole("button", { name: /Approve/ })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(s.calls.some((c) => c.method === "POST")).toBe(false);
});

it("links the other drafts of the Posting, so an earlier approved draft is reachable", async () => {
  renderReview(
    stub({
      drafts: drafts({
        drafts: [
          {
            id: 5,
            status: "superseded",
            createdAt: "2026-11-17T12:00:00.000Z",
            approvedAt: "2026-11-17T13:00:00.000Z",
          },
          {
            id: 7,
            status: "draft",
            createdAt: "2026-11-18T12:00:00.000Z",
            approvedAt: null,
          },
        ],
      }),
    }),
  );
  await screen.findByText("Sam Sample");

  const link = screen.getByRole("link", { name: /Draft 1 \(superseded\)/ });
  expect(link.getAttribute("href")).toBe("/resumes/5");
  expect(link.parentElement?.textContent).toContain("has files");
  expect(screen.getByText(/Draft 2 \(draft\), shown/)).toBeTruthy();
});

it("says so when the draft cannot be loaded", async () => {
  const s = stub();
  (s.client.GET as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    error: {},
    response: { status: 404 },
  });
  renderReview(s, "/resumes/99");

  await screen.findByText("This draft could not be loaded.");
});

it("opens on the first flagged line even when it is not the first line", async () => {
  renderReview(
    stub({
      resume: resume({
        verdicts: [
          { line: "summary[0]", status: "pass" },
          {
            line: "experiences[0].bullets[1]",
            status: "overstatement",
            note: "Too strong.",
          },
        ],
      }),
    }),
  );
  await screen.findByText("Sam Sample");

  expect(pressed()).toEqual(["Cut the report time by half."]);
  expect(inspector().getByText("Too strong.")).toBeTruthy();
});

it("reloads the draft when approve answers 409, so the screen shows what it now is", async () => {
  const s = stub({
    approve: () => ({ error: {}, response: { status: 409 } }) as never,
  });
  renderReview(s);
  await screen.findByText("Sam Sample");
  const loads = () =>
    s.calls.filter(
      (c) => c.method === "GET" && c.path === "/tailored-resumes/{id}",
    ).length;
  expect(loads()).toBe(1);

  fireEvent.click(
    screen.getByRole("button", { name: "Approve resume and cover letter" }),
  );

  await waitFor(() => expect(loads()).toBe(2));
});

it("does not blame the render when approve fails for another reason", async () => {
  renderReview(
    stub({
      approve: () => ({ error: {}, response: { status: 401 } }) as never,
    }),
  );
  await screen.findByText("Sam Sample");

  fireEvent.click(
    screen.getByRole("button", { name: "Approve resume and cover letter" }),
  );

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).not.toContain("rendered");
  expect(alert.textContent).toContain("did not go through");
});
