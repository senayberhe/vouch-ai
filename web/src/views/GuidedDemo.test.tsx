import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GuidedDemo, { DEMO_DOCUMENTS, DEMO_QUESTION } from "./GuidedDemo";
import { createClient, type DocumentRow } from "../api";
afterEach(cleanup);
const me = { user: "alice", tenant: "acme", role: "editor", groups: ["engineering"], release_operator: false };
const docs: DocumentRow[] = DEMO_DOCUMENTS.map((d, i) => ({ document_id: `d${i}`, title: d.title, group: "engineering", owner: "alice", created_at: "2026-10-29" }));
const base = { me, docs: [], onLoaded: vi.fn(), onQuestion: vi.fn(), answered: false, onResearch: vi.fn() };
it("loads only missing samples and does not write on mount", async () => {
  const upload = vi.fn().mockResolvedValue({ document_id: "new", chunks: 1, redactions: {} });
  render(<GuidedDemo {...base} client={{ ...createClient(null), documents: async () => [docs[0]], upload }} />);
  expect(upload).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Load sample documents" }));
  expect(upload).toHaveBeenCalledExactlyOnceWith(DEMO_DOCUMENTS[1].title, "engineering", DEMO_DOCUMENTS[1].text);
});
it("prefills the question and opens a real research job without repeating submission", async () => {
  const onQuestion = vi.fn(), onResearch = vi.fn();
  const createJob = vi.fn().mockResolvedValue({ job_id: "demo-job", status: "queued" });
  render(<GuidedDemo {...base} docs={docs} onQuestion={onQuestion} onResearch={onResearch} client={{ ...createClient(null), createJob }} />);
  await userEvent.click(screen.getByRole("button", { name: "Try the sample question" }));
  expect(onQuestion).toHaveBeenCalledWith(DEMO_QUESTION, "engineering");
  await userEvent.click(screen.getByRole("button", { name: "Start demo research" }));
  expect(createJob).toHaveBeenCalledExactlyOnceWith(DEMO_QUESTION, "engineering");
  expect(onResearch).toHaveBeenCalledWith("demo-job");
  await userEvent.click(screen.getByRole("button", { name: "Open demo research" }));
  expect(createJob).toHaveBeenCalledTimes(1);
});
it("disables loading for readers and surfaces upload failures", async () => {
  const client = { ...createClient(null), documents: async () => [], upload: vi.fn().mockRejectedValue(new Error("offline")) };
  const view = render(<GuidedDemo {...base} client={client} me={{ ...me, role: "reader" }} />);
  expect(screen.getByRole("button", { name: "Load sample documents" })).toBeDisabled();
  view.rerender(<GuidedDemo {...base} client={client} />);
  await userEvent.click(screen.getByRole("button", { name: "Load sample documents" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the API");
  expect(screen.getByRole("button", { name: "Try the sample question" })).toBeDisabled();
});
