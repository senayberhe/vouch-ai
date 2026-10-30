import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, createAuth, createClient, type Client, type Me } from "./api";
import { Button, describe, ErrorNote, Field } from "./ui";
import Knowledge from "./views/Knowledge";
import Research from "./views/Research";
import Releases from "./views/Releases";
import Incidents from "./views/Incidents";
import Quality from "./views/Quality";
import Workspace from "./views/Workspace";

// Accounts use an HttpOnly session cookie the page can't read. Development bearer keys are kept in
// sessionStorage instead: they survive a reload but are dropped when the tab closes.
const TOKEN_KEY = "capstone.token";

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: stay signed in for this page only */
  }
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}

type Tab = "knowledge" | "research" | "quality" | "releases" | "incidents" | "workspace";

const SECTION_INFO: Record<Tab, { title: string; description: string; path: string }> = {
  knowledge: { title: "Your knowledge, connected.", description: "Turn trusted documents into clear answers. Every source stays in your workspace.", path: "M4 5h6l2 2h8v13H4z M8 12h8 M8 16h5" },
  research: { title: "From question to insight.", description: "Start a research task, explore the evidence, and bring a second pair of eyes.", path: "M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M8 3h8 M8 15h8" },
  quality: { title: "Confidence starts with evidence.", description: "Look beyond the average. Evaluate your model and see how every group performs.", path: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2" },
  releases: { title: "Ship with confidence.", description: "Move from signed evidence to a measured rollout, with a clear path back.", path: "M14 4c3-1 6-1 6-1s0 3-1 6l-7 7-5-5z M7 11l-4 1v5l4-1 M12 16l-1 5h5l1-5 M5 19l-2 2 M15 8h.01" },
  incidents: { title: "Stay ahead of the unexpected.", description: "Track, contain, and resolve incidents across your workspace.", path: "M12 3l9 17H3z M12 9v5 M12 17h.01" },
  workspace: { title: "Bring your team into the workspace.", description: "Invite teammates with a role that matches the work they need to do.", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 M20 8v6 M23 11h-6" },
};

function SectionIcon({ id }: { id: Tab }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SECTION_INFO[id].path} /></svg>;
}


export function tabsFor(me: Me): { id: Tab; label: string }[] {
  const tabs: { id: Tab; label: string }[] = [
    { id: "knowledge", label: "Knowledge" },
    { id: "research", label: "Research" },
  ];
  if (me.role === "admin" || me.role === "reviewer") tabs.push({ id: "quality", label: "Quality" });
  if (me.release_operator) tabs.push({ id: "releases", label: "Releases" });
  if (me.role === "admin" || me.role === "reviewer") tabs.push({ id: "incidents", label: "Incidents" });
  if (me.role === "admin") tabs.push({ id: "workspace", label: "Workspace" });
  return tabs;
}

const ROLE_ORDER = ["admin", "reviewer", "editor", "reader"];

type Mode = "signin" | "signup";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[18px]">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Reads and removes ?auth_error= left by a failed Google redirect, so a reload doesn't repeat it. */
function takeRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("auth_error")) return null;
  params.delete("auth_error");
  const query = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  return "Google sign-in didn't complete. Try again, or use your email and password.";
}

function authError(err: unknown): string {
  // Sign-in failures (401 wrong password, 409 email taken, 429 too many tries) carry a readable detail.
  return err instanceof ApiError && [401, 409, 422, 429].includes(err.status) ? err.message : describe(err);
}

export function SignIn({ onSignedIn, identities = __DEV_IDENTITIES__, auth = createAuth() }: {
  /** token is a development bearer key, or null for an account session held in the HttpOnly cookie. */
  onSignedIn: (token: string | null, me: Me) => void; identities?: DevIdentity[]; auth?: ReturnType<typeof createAuth>;
}) {
  const inviteToken = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("invite"), []);
  const [mode, setMode] = useState<Mode>(inviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [google, setGoogle] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [error, setError] = useState<string | null>(takeRedirectError);
  const [busy, setBusy] = useState(false);
  const quick = [...identities].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  useEffect(() => {
    auth.config().then((c) => { setGoogle(c.google); setInviteOnly(c.invite_only); }).catch(() => setGoogle(false));
  }, [auth]);

  useEffect(() => {
    if (!inviteToken) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    auth.inspectInvitation(inviteToken).then((invite) => setEmail(invite.email)).catch(() => {
      setError("This invitation link is invalid or has expired. Ask your workspace admin for a new one.");
    });
  }, [auth, inviteToken]);

  async function attempt(fn: () => Promise<void>, explain: (err: unknown) => string = authError) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  function submitAccount(e: FormEvent) {
    e.preventDefault();
    attempt(async () => {
      const who = mode === "signup" ? await auth.signup(email.trim(), password, inviteToken ?? undefined) : await auth.login(email.trim(), password);
      onSignedIn(null, who);
    });
  }

  function signInWithToken(value: string) {
    attempt(async () => onSignedIn(value, await createClient(value).me()), describe);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  const signup = mode === "signup";
  return (
    <main className="auth-layout">
      <aside className="auth-story" aria-label="About your workspace">
        <div className="auth-brand"><Logo /> Secure AI Platform <span>WORKSPACE</span></div>
        <div className="auth-story-content">
          <p className="eyebrow">A little clarity. A lot of possibility.</p>
          <h2>Good questions.<br />Trusted answers.<br /><em>Your next idea.</em></h2>
          <p>A thoughtful space for your knowledge, research, and everything you’re ready to discover.</p>
          <div className="knowledge-art" aria-hidden="true">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-node node-top">01 <span>Your documents</span></div>
            <div className="art-center"><Logo /></div>
            <div className="art-node node-bottom">02 <span>Connected insights</span></div>
            <span className="art-spark spark-one" /><span className="art-spark spark-two" />
          </div>
        </div>
        <div className="auth-footnote"><Logo /> Built around your privacy. Designed for your ideas.</div>
      </aside>
      <div className="auth-form-wrap">
      <div className="auth-form grid w-full max-w-md gap-5">
        <p className="eyebrow text-accent">YOUR PRIVATE WORKSPACE</p>
        <div className="flex items-center gap-2">
          <Logo />
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-accent">Secure AI Platform</p>
        </div>
        <div>
          <h1>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="m-0 mt-1 text-muted">
            {signup ? "You get a private workspace. Nobody else can see your documents." : "Sign in to your workspace."}
          </p>
        </div>

        {!inviteToken && <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${mode === m
                      ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>}

        {inviteToken && <p className="m-0 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">You’re joining a shared workspace. Create an account for the invited email below.</p>}
        {inviteOnly && !inviteToken && mode === "signup" && <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">This workspace is invite-only. Use the invitation link from your workspace admin.</p>}

        {google && !inviteToken && (
          <>
            {/* A full-page navigation: the server runs the Google redirect, so no Google script loads here. */}
            <a href="/v1/auth/google/start"
               className="flex items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2 font-medium text-ink no-underline transition hover:border-muted">
              <GoogleMark />Continue with Google
            </a>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
              <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form className="grid gap-3.5" onSubmit={submitAccount}>
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   maxLength={64} required readOnly={Boolean(inviteToken)} />
          </Field>
          <Field label="Password" hint={signup ? "At least 12 characters. A short phrase is easiest to remember." : undefined}>
            <input type="password" autoComplete={signup ? "new-password" : "current-password"} value={password}
                   onChange={(e) => setPassword(e.target.value)} minLength={signup ? 12 : 1} maxLength={128} required />
          </Field>
          <ErrorNote error={error} />
          <Button variant="primary" className="w-full" disabled={busy || !email.trim() || !password || (inviteOnly && signup && !inviteToken)}>
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <details className="border-t border-dashed border-line pt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">Use a development bearer token</summary>
          <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); signInWithToken(token.trim()); }}>
            <p className="m-0 text-muted">Paste a token from <code>CAPSTONE_TOKENS_JSON</code> in your <code>.env</code>.</p>
            <Field label="Bearer token">
              <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
            <Button disabled={busy || !token.trim()}>Use token</Button>
            {quick.length > 0 && (
              <div className="grid gap-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-warn">Development only · sign in as</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {quick.map((id) => (
                    <Button key={id.token} type="button" disabled={busy} onClick={() => signInWithToken(id.token)}
                            className="grid gap-0.5 text-left">
                      <span className="font-semibold">{id.user}</span>
                      <span className="text-xs text-muted">{id.role} · {id.tenant}</span>
                    </Button>
                  ))}
                </div>
                <p className="m-0 text-xs text-muted">Read from <code>.env</code> by <code>npm run dev</code>. Never shown in a production build.</p>
              </div>
            )}
          </form>
        </details>
      </div>
      <p className="auth-caption">Knowledge with boundaries. Possibility without the noise.</p>
      </div>
    </main>
  );
}

export default function App() {
  // null token = account session cookie. `me` is null until a session is confirmed.
  const [token, setToken] = useState<string | null>(() => readToken() || null);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("knowledge");
  const [demoJobId, setDemoJobId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const client: Client = useMemo(() => createClient(token), [token]);

  useEffect(() => {
    if (!restoring) return;
    // A stored dev token, or else the session cookie (if any). Either failing just shows the sign-in page.
    client.me().then(setMe).catch(() => { writeToken(null); setToken(null); }).finally(() => setRestoring(false));
  }, [client, restoring]);

  function signOut() {
    if (!token) createAuth().logout().catch(() => { /* the cookie expires on its own */ });
    writeToken(null);
    setToken(null);
    setMe(null);
    setTab("knowledge");
    setDemoJobId(null);
  }

  if (restoring) return <main className="grid min-h-screen place-items-center p-4"><p className="animate-pulse text-muted">Restoring session…</p></main>;
  if (!me) {
    return <SignIn onSignedIn={(t, who) => { writeToken(t); setToken(t); setMe(who); }} />;
  }

  const tabs = tabsFor(me);
  const active = tabs.some((t) => t.id === tab) ? tab : "knowledge";
  return (
    <div className="workspace-layout">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      <aside className="workspace-sidebar">
        <div className="sidebar-brand"><div className="brand-mark"><Logo /></div><div>Secure AI<span>ENGINEERING WORKSPACE</span></div></div>
        <div className="workspace-switch"><span className="workspace-avatar">{me.tenant.slice(0, 2).toUpperCase()}</span><div><strong>{me.tenant}</strong><span>Private workspace</span></div></div>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Sections" className="workspace-nav">
          {tabs.map((t) => <button key={t.id} aria-current={active === t.id ? "page" : undefined} onClick={() => setTab(t.id)} className={active === t.id ? "nav-item is-active" : "nav-item"}>
            <SectionIcon id={t.id} /><span>{t.label}</span><span className="nav-arrow" aria-hidden="true">↗</span>
          </button>)}
        </nav>
        <div className="sidebar-note"><Logo /><strong>A space you can trust.</strong><p>Your documents are scoped to your workspace and access groups.</p></div>
        <div className="sidebar-user"><span className="user-avatar" aria-hidden="true">{me.user.slice(0, 1).toUpperCase()}</span><div><strong>{me.user}</strong><span>{me.role}</span></div><button onClick={signOut} aria-label="Sign out" title="Sign out"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5H4v14h5 M10 12h11 M17 8l4 4-4 4" /></svg></button></div>
      </aside>
      <div className="workspace-body">
      <header className="workspace-topbar"><div><span className="breadcrumb-root">Workspace</span><span aria-hidden="true">/</span><strong>{tabs.find(t => t.id === active)?.label}</strong></div><span className="privacy-pill"><Logo />Private by design</span></header>
      <main id="workspace-content" className="workspace-content">
        <section className="page-intro"><div><p className="eyebrow">{active === "knowledge" ? "A HOME FOR WHAT YOU KNOW" : "YOUR SECURE AI WORKSPACE"}</p><h1>{SECTION_INFO[active].title}</h1><p>{SECTION_INFO[active].description}</p></div><span className="page-emblem" aria-hidden="true"><SectionIcon id={active} /></span></section>
        {active === "knowledge" && <Knowledge client={client} me={me} onResearch={id => { setDemoJobId(id); setTab("research"); }} />}
        {active === "research" && <Research client={client} me={me} initialJobId={demoJobId} />}
        {active === "quality" && <Quality client={client} />}
        {active === "releases" && <Releases client={client} me={me} />}
        {active === "incidents" && <Incidents client={client} me={me} />}
        {active === "workspace" && me.role === "admin" && <Workspace client={client} />}
        <footer className="workspace-footer"><span>Secure AI Platform</span><span>Thoughtful research. Traceable decisions.</span></footer>
      </main>
      </div>
    </div>
  );
}
