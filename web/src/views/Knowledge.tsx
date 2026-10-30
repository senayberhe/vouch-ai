import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Answer, Client, DocumentRow, Me } from "../api";
import { Button, Card, ErrorNote, Field, useAction, tw } from "../ui";

import GuidedDemo from "./GuidedDemo";

const LABELS: Record<string, string> = {
  EMAIL_ADDRESS: "email", PHONE_NUMBER: "phone", US_SSN: "SSN", CREDIT_CARD: "card number", IBAN_CODE: "IBAN", PERSON: "name",
};

export default function Knowledge({ client, me, onResearch }: { client: Client; me: Me; onResearch: (id: string) => void }) {
  const [suggestion, setSuggestion] = useState<{ question: string; group: string } | null>(null);
  const [demoAnswered, setDemoAnswered] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const list = useAction();
  const refresh = useCallback(() => list.run(() => client.documents().then(setDocs)), [client, list.run]);
  useEffect(() => { refresh(); }, [refresh]);
  const canUpload = (me.role === "editor" || me.role === "admin") && me.groups.length > 0;

  return (
    <div className="grid gap-6">
      <GuidedDemo client={client} me={me} docs={docs} onLoaded={refresh} onQuestion={(question, group) => { setSuggestion({ question, group }); setDemoAnswered(false); }} answered={demoAnswered} onResearch={onResearch} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-5">
        <AskCard client={client} me={me} suggestion={suggestion} onAnswered={() => setDemoAnswered(true)} />
        {canUpload && <UploadCard client={client} me={me} onUploaded={refresh} />}
      </div>
      <Card title="Documents you can access" actions={<Button variant="ghost" onClick={refresh}>Refresh</Button>}>
        <ErrorNote error={list.error} />
        {me.groups.length === 0 && <p className="text-muted">Your identity has no document groups, so nothing is visible.</p>}
        {docs.length === 0 && me.groups.length > 0 && <div className="empty-state"><span className="empty-icon" aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 2h10l6 6v18H4z M14 2v7h6 M8 14h8 M8 19h6" /></svg></span><h3>{list.busy ? "Finding your documents…" : "A fresh space for your knowledge"}</h3><p>{canUpload ? "Add your first document. Your next answer starts with a trusted source." : "Documents shared with your groups will appear here."}</p></div>}
        <ul className={tw.rows}>
          {docs.map((d) => (
            <li className="document-item" key={d.document_id}>
              <span className="document-symbol" aria-hidden="true"><svg width="18" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2h9l5 5v15H5z M14 2v6h5 M9 12h6 M9 16h6" /></svg></span>
              <div><strong>{d.title}</strong><p>{d.group} · {d.owner}<br />{new Date(d.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p></div>
            </li>
          ))}
        </ul>
      </Card>
      </div>
    </div>
  );
}

function AskCard({ client, me, suggestion, onAnswered }: { client: Client; me: Me; suggestion: { question: string; group: string } | null; onAnswered: () => void }) {
  const [question, setQuestion] = useState("");
  const [group, setGroup] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const ask = useAction();
  useEffect(() => {
    if (suggestion) {
      setQuestion(suggestion.question);
      setGroup(suggestion.group);
      setAnswer(null);
      document.getElementById("knowledge-question")?.focus();
    }
  }, [suggestion]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await ask.run(() => client.ask(question.trim(), group || undefined));
    if (result) { setAnswer(result); if (question.trim() === suggestion?.question && group === suggestion.group) onAnswered(); }
  }

  return (
    <Card title="Ask your documents">
      <p className="question-hint">A question, a few trusted sources, a clearer picture.</p>
      <form className={tw.form} onSubmit={submit}>
        <Field label="Question">
          <input id="knowledge-question" value={question} maxLength={3000} onChange={(e) => setQuestion(e.target.value)} required
                 placeholder="When should travel receipts be submitted?" />
        </Field>
        <Field label="Group">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All my groups</option>
            {me.groups.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <ErrorNote error={ask.error} />
        <Button variant="primary" disabled={ask.busy || !question.trim()}>{ask.busy ? "Searching…" : "Ask"}</Button>
      </form>
      {answer && (
        <div className="mt-4 grid gap-1.5 border-t border-line pt-4">
          <p className={tw.label}>Answer <span className="text-muted">({answer.mode})</span></p>
          {/* Rendered as text, never HTML: source passages are untrusted. */}
          <p className={tw.prewrap}>{answer.answer}</p>
          {answer.citations.length > 0 && (
            <>
              <p className={tw.label}>Sources</p>
              <ul className="m-0 list-disc pl-5">
                {answer.citations.map((c) => <li key={c.citation_id}>{c.title} <code>{c.citation_id}</code></li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function UploadCard({ client, me, onUploaded }: { client: Client; me: Me; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState(me.groups[0] ?? "");
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const upload = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const result = await upload.run(() => client.upload(title.trim(), group, text));
    if (result) {
      const redacted = Object.entries(result.redactions ?? {});
      setDone(`Uploaded in ${result.chunks} chunk(s).` + (redacted.length
        ? ` Redacted before storing: ${redacted.map(([kind, n]) => `${n} ${LABELS[kind] ?? kind}`).join(", ")}.`
        : " No personal data detected."));
      setTitle("");
      setText("");
      onUploaded();
    }
  }

  return (
    <Card title="Upload a document">
      <form className={tw.form} onSubmit={submit}>
        <Field label="Title"><input value={title} maxLength={180} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Group" hint="Only members of this group (in your tenant) can retrieve it.">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {me.groups.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Text"><textarea rows={6} value={text} maxLength={25000} onChange={(e) => setText(e.target.value)} required /></Field>
        <ErrorNote error={upload.error} />
        {done && <p className={tw.success}>{done}</p>}
        <Button variant="primary" disabled={upload.busy || !title.trim() || !text.trim()}>{upload.busy ? "Uploading…" : "Upload"}</Button>
      </form>
    </Card>
  );
}
