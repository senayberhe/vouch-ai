import { useState } from "react";
import type { Client, DocumentRow, Me } from "../api";
import { Button, Card, ErrorNote, Field, useAction } from "../ui";

export const DEMO_QUESTION = "When should demo travel receipts be submitted?";
export const DEMO_DOCUMENTS = [
  { title: "Demo · Travel policy", text: "Demo travel receipts must be submitted within thirty days of the trip. Every reimbursement claim needs an itemized receipt. These are fictional policies for the guided demo." },
  { title: "Demo · Research review", text: "Demo research reports require approval by an independent reviewer in the same workspace with access to the report's groups. The report's author cannot approve their own work. Approval is internal sign-off and does not publish the report." },
];

export default function GuidedDemo({ client, me, docs, onLoaded, onQuestion, answered, onResearch }: {
  client: Client; me: Me; docs: DocumentRow[]; onLoaded: () => void;
  onQuestion: (question: string, group: string) => void; answered: boolean;
  onResearch: (id: string) => void;
}) {
  const [group, setGroup] = useState(me.groups[0] ?? "");
  const [loadedGroup, setLoadedGroup] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const action = useAction();
  const ready = DEMO_DOCUMENTS.every(sample => docs.some(d => d.title === sample.title && d.group === group));
  const canUpload = ["admin", "editor"].includes(me.role) && !!group;

  async function load() {
    const result = await action.run(async () => {
      // Re-read on retries so partial uploads don't create duplicate sample titles.
      const existing = await client.documents();
      for (const sample of DEMO_DOCUMENTS) {
        if (!existing.some(d => d.title === sample.title && d.group === group)) {
          await client.upload(sample.title, group, sample.text);
        }
      }
      return group;
    });
    onLoaded();
    if (result) setLoadedGroup(result);
  }

  async function research() {
    if (jobId) { onResearch(jobId); return; }
    const job = await action.run(() => client.createJob(DEMO_QUESTION, group));
    if (job) { setJobId(job.job_id); onResearch(job.job_id); }
  }

  return (
    <Card title="Take your workspace for a spin" className="guided-demo">
      <p className="demo-intro">Three small steps. Real sources, a traceable answer, and a report ready for a second pair of eyes.</p>
      <div className="demo-steps">
        <section><span className="demo-step-number" aria-hidden="true">01</span><h3>Add a little knowledge</h3><p>Load two fictional policies into a group you can access. Existing documents stay in place.</p>
          <Field label="Demo access group"><select value={group} disabled={action.busy || !!jobId} onChange={e => { setGroup(e.target.value); setLoadedGroup(null); }}>
            {me.groups.map(g => <option key={g}>{g}</option>)}
          </select></Field>
          <Button disabled={action.busy || ready || !canUpload} onClick={load}>{ready ? "Sample documents ready" : action.busy ? "Please wait…" : "Load sample documents"}</Button>
          {!canUpload && !ready && <p>Ask an editor to add the samples to your group.</p>}
        </section>
        <section><span className="demo-step-number" aria-hidden="true">02</span><h3>Follow the evidence</h3><p>Try “When should demo travel receipts be submitted?” Then inspect the source citations below the answer.</p>
          <Button disabled={action.busy || !ready} onClick={() => onQuestion(DEMO_QUESTION, group)}>Try the sample question</Button>
          <span className="demo-step-caption">{answered && loadedGroup === group ? "You’ve received an answer. Check its sources." : "Fills the question below. Select Ask to search."}</span>
        </section>
        <section><span className="demo-step-number" aria-hidden="true">03</span><h3>Bring a second pair of eyes</h3><p>Send the same question to the research worker. The report pauses for an independent reviewer.</p>
          <Button disabled={action.busy || !ready} onClick={research}>{jobId ? "Open demo research" : "Start demo research"}</Button>
          <span className="demo-step-caption">Sign in separately as an authorized reviewer to approve. Your own account cannot self-approve.</span>
        </section>
      </div>
      <ErrorNote error={action.error} />
      <p className="demo-footnote" role="status">{loadedGroup === group ? `Samples added to ${group}. Continue with the sample question.` : "Sample documents are saved to the selected group. Questions use your workspace’s configured answer mode."}</p>
    </Card>
  );
}
