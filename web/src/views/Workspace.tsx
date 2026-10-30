import { useEffect, useState, type FormEvent } from "react";
import type { Client } from "../api";
import { Button, Card, ErrorNote, Field, useAction } from "../ui";

type Invitation = { email: string; role: string; expires_at: string; expired: boolean };

export default function Workspace({ client }: { client: Client }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"reader" | "editor" | "reviewer">("reader");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const action = useAction();

  async function refresh() {
    setInvitations(await client.invitations());
  }
  useEffect(() => { refresh().catch(() => undefined); }, [client]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await action.run(() => client.invite(email.trim(), role));
    if (result) {
      setInviteUrl(result.invite_url);
      setEmail("");
      await refresh();
    }
  }

  return <div className="grid gap-5">
    <Card title="Invite a teammate">
      <p className="mb-4 text-sm leading-6 text-muted">Invitations expire after seven days and can be used once. The recipient must create a new account with the invited email. Share the link through a trusted channel; this app does not send email.</p>
      <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={submit}>
        <Field label="Email address"><input type="email" maxLength={64} required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Workspace role"><select value={role} onChange={e => setRole(e.target.value as typeof role)}>
          <option value="reader">Reader</option><option value="editor">Editor</option><option value="reviewer">Reviewer</option>
        </select></Field>
        <Button variant="primary" disabled={action.busy || !email.trim()}>Create invitation</Button>
      </form>
      <div className="mt-3"><ErrorNote error={action.error} /></div>
      {inviteUrl && <div className="mt-4 grid gap-2 rounded-lg border border-line bg-surface-2 p-3">
        <p className="m-0 text-sm font-semibold">Invitation link ready</p>
        <input aria-label="Invitation link" readOnly value={inviteUrl} onFocus={e => e.currentTarget.select()} />
        <Button onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(inviteUrl).catch(() => undefined); }}>Copy invitation link</Button>
      </div>}
    </Card>

    <Card title="Pending invitations">
      {invitations.length === 0 ? <p className="m-0 text-sm text-muted">No pending invitations.</p> : <ul className="m-0 grid list-none gap-2 p-0">
        {invitations.map(invite => <li key={`${invite.email}:${invite.expires_at}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-sm">
          <span><strong>{invite.email}</strong><span className="ml-2 text-muted">{invite.role}</span></span>
          <span className={invite.expired ? "text-bad" : "text-muted"}>{invite.expired ? "Expired" : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}</span>
        </li>)}
      </ul>}
    </Card>
  </div>;
}
