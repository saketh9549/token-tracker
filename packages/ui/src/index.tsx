import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Database, FileJson, GitBranch, Globe, Layers, Leaf, MoreHorizontal, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Terminal, Trash2, Upload, X } from 'lucide-react';
import { buildTrace, estimateTokens, exportUsage, importUsage, knownTokens, summarize, ESTIMATOR, type TokenEvent, type TraceNode } from '@promptpulse/core';
import { importTelemetry } from '@promptpulse/adapters';
import { DEFAULT_SETTINGS, type Settings, type Store } from '@promptpulse/storage';
import { sampleEvents } from './sample';

type Page = 'Overview' | 'Sessions' | 'Trace explorer' | 'Prompt inspector' | 'Settings';
const nav = [{ name: 'Overview', icon: Activity }, { name: 'Sessions', icon: Layers }, { name: 'Trace explorer', icon: GitBranch }, { name: 'Prompt inspector', icon: SlidersHorizontal }, { name: 'Settings', icon: Settings2 }] as const;
const number = (n: number) => n.toLocaleString();
const compact = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
const sourceLabel = (e: TokenEvent) => e.measurement === 'estimated' ? 'Estimated' : e.measurement === 'unknown' ? 'Unknown' : 'Reported';
const platformLabel = (e: TokenEvent) => e.platform === 'vscode' ? 'VS Code / Copilot' : e.platform === 'chatgpt' ? 'ChatGPT' : e.platform;
const extension = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const dateLabel = (date: string) => new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const sessionName = (id: string) => id.startsWith('sample:') ? `Sample ${id.includes('chatgpt') ? 'conversation' : 'agent task'} ${Number(id.split(':').at(-1)) + 1}` : `${id.startsWith('chatgpt:') ? 'Conversation' : 'Session'} · ${id.split(':').at(-1)?.slice(0, 12)}`;
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Metric({ title, value, caption, icon, tone = '' }: { title: string; value: string; caption: string; icon: ReactNode; tone?: string }) {
  return <article className={`metric ${tone}`}><div className="metric-title">{title}<span>{icon}</span></div><div className="metric-value">{value}<small>tokens</small></div><div className="metric-caption">{caption}</div></article>;
}
function saveFile(contents: string, name: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App({ store, onExport }: { store: Store; onExport?: (contents: string, filename: string) => Promise<void> }) {
  const [page, setPage] = useState<Page>('Overview');
  const [saved, setSaved] = useState<TokenEvent[]>([]);
  const [sample, setSample] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [platform, setPlatform] = useState('all');
  const [search, setSearch] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [permission, setPermission] = useState(false);
  const [health, setHealth] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const sampleData = useMemo(sampleEvents, []);
  async function refresh() {
    try {
      const [data, preferences] = await Promise.all([store.load(), store.getSettings()]);
      setSaved(data); setSettings(preferences);
      if (extension()) {
        setPermission(await chrome.permissions.contains({ origins: ['https://chatgpt.com/*'] }));
        const state = await chrome.storage.local.get<{ adapterHealth?: { health: string; updatedAt: string } }>('adapterHealth');
        setHealth(state.adapterHealth ? `${state.adapterHealth.health} · last scan ${dateLabel(state.adapterHealth.updatedAt)}` : 'No collector scan yet. Reload a ChatGPT conversation after enabling access.');
      }
    } catch (error) { setNotice(`Could not load local data: ${String(error)}`); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); const interval = setInterval(refresh, 5000); return () => clearInterval(interval); }, [store]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const events = sample ? sampleData : saved;
  const filtered = useMemo(() => {
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - days + 1);
    return events.filter(e => Date.parse(e.timestamp) >= cutoff.getTime() && (platform === 'all' || e.platform === platform));
  }, [events, days, platform]);
  const summary = summarize(filtered);
  const sessions = [...new Set(filtered.map(e => e.sessionId))].map(id => {
    const records = filtered.filter(e => e.sessionId === id);
    return { id, records, summary: summarize(records), last: records.reduce((a, b) => a.timestamp > b.timestamp ? a : b) };
  }).sort((a, b) => b.last.timestamp.localeCompare(a.last.timestamp));

  async function importFile(selected: File) {
    try {
      if (selected.size > 20_000_000) throw new Error('Choose a file smaller than 20 MB');
      const contents = await selected.text();
      let envelope: any; try { envelope = JSON.parse(contents); } catch { /* JSONL file */ }
      const parsed = envelope?.format === 'promptpulse' ? { events: importUsage(contents, settings.rawText), warnings: [], skipped: 0 } : importTelemetry(contents);
      if (!parsed.events.length) throw new Error(parsed.warnings.join('; ') || 'No supported model, agent, or tool spans found');
      await store.upsert(parsed.events); setSample(false); await refresh();
      setNotice(`Processed ${parsed.events.length} unique records. Duplicate IDs update existing records; retention may discard older events.${parsed.skipped ? ` ${parsed.skipped} unsupported lines or spans skipped.` : ''}${parsed.warnings.length ? ` ${parsed.warnings.slice(0, 3).join('; ')}.` : ''}`);
    } catch (error) { setNotice(`Import failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  async function resetCollector() {
    if (!extension()) return;
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    await Promise.allSettled(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: 'RESET_CAPTURE' }) : Promise.resolve()));
  }
  async function updateSettings(next: Settings) {
    try {
      if (next.retentionDays && (!settings.retentionDays || next.retentionDays < settings.retentionDays) && !window.confirm('This retention change permanently deletes local records older than the selected period. Apply it?')) return;
      await store.setSettings(next); setSettings(next); await resetCollector(); await refresh(); setNotice('Privacy settings saved locally.');
    } catch (error) { setNotice(`Could not save settings: ${String(error)}`); }
  }
  async function togglePermission() {
    try {
      if (!extension()) { setNotice('Load the browser extension build to enable ChatGPT collection. The standalone dashboard supports file imports.'); return; }
      const requested = { origins: ['https://chatgpt.com/*'] };
      if (permission) await chrome.permissions.remove(requested); else await chrome.permissions.request(requested);
      await refresh(); setNotice('Site access updated. Reload open ChatGPT conversations to apply it.');
    } catch (error) { setNotice(`Site permission failed: ${String(error)}`); }
  }
  async function deleteAll() {
    try {
      await store.setSettings({ ...settings, captureEnabled: false });
      await store.clear(); setSample(false); setConfirmDelete(false); await refresh();
      if (extension()) await chrome.storage.local.remove('adapterHealth');
      setNotice('Local records deleted. Collection is paused; resume it in Settings when ready.');
    } catch (error) { setNotice(`Delete failed: ${String(error)}`); }
  }
  async function exportData() {
    try {
      const contents = exportUsage(events);
      const filename = sample ? 'promptpulse-sample.json' : 'promptpulse-export.json';
      if (onExport) await onExport(contents, filename); else saveFile(contents, filename);
    } catch (error) { setNotice(`Export failed: ${String(error)}`); }
  }

  const subtitles: Record<Page, string> = { Overview: 'A clearer picture of your AI usage.', Sessions: 'Every conversation and agent task, in one place.', 'Trace explorer': 'Follow the work. Understand each model call.', 'Prompt inspector': 'Measure what you write before you send it.', Settings: 'Your data, your boundaries.' };
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('Overview'); }}><span className="brand-mark"><Activity size={22}/></span>PromptPulse<span className="brand-dot"/></a>
      <div className="workspace"><span className="workspace-icon"><Code2 size={18}/></span><div><strong>Personal workspace</strong><small>Local observatory</small></div><Badge>v0.1</Badge></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.name} className={page === item.name ? 'active' : ''} onClick={() => { setPage(item.name); setSearch(''); }}><item.icon size={18}/>{item.name}{item.name === 'Trace explorer' && summary.modelCalls > 0 && <span className="nav-count">{summary.modelCalls}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><ShieldCheck size={19}/><strong>Private by design</strong><p>Your usage stays on this device. No account required.</p></div><button className="sample-toggle" onClick={() => setSample(!sample)}><CircleHelp size={16}/>{sample ? 'Return to my data' : 'Explore sample data'}<ArrowUpRight size={14}/></button><div className="version"><span className="dot"/> Local storage active<span>0.1.0</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={13}/><span>{page}</span></div><div className="top-actions"><span className="local-status"><span className="dot"/> On this device</span><span className="avatar">P</span></div></header>
      <main>
        {sample && <div className="sample-banner"><Sparkles size={16}/><span>Exploring synthetic sample data. These records are separate from your saved usage.</span><button onClick={() => setSample(false)}>Back to my data <X size={14}/></button></div>}
        <div className="page-heading"><div><div className="eyebrow">AI USAGE OBSERVATORY</div><h1>{page}</h1><p>{subtitles[page]}</p></div><div className="heading-actions"><button className="button secondary" onClick={exportData} disabled={loading}><ArrowDownToLine size={15}/>{sample ? 'Export sample' : 'Export data'}</button><button className="button primary" onClick={() => file.current?.click()}><Upload size={15}/>Import usage</button></div></div>
        <input ref={file} type="file" accept=".json,.jsonl,application/json" hidden aria-label="Import usage file" onChange={e => { const selected = e.target.files?.[0]; if (selected) void importFile(selected); e.target.value = ''; }}/>
        {notice && <div className="notice" role="status"><FileJson size={16}/><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={16}/></button></div>}
        {(page === 'Overview' || page === 'Sessions' || page === 'Trace explorer') && <div className="filterbar"><div className="segmented">{[1, 7, 30].map(n => <button key={n} className={days === n ? 'selected' : ''} onClick={() => setDays(n)}>{n === 1 ? 'Today' : `Last ${n} days`}</button>)}</div><label className="select-label"><Globe size={14}/><select aria-label="Filter by source" value={platform} onChange={e => setPlatform(e.target.value)}><option value="all">All sources</option><option value="chatgpt">ChatGPT</option><option value="vscode">VS Code / Copilot</option></select></label><span className="filter-note">{filtered.length} observed records</span></div>}
        {loading ? <div className="empty"><Activity size={30}/><h2>Opening your observatory</h2><p>Loading local records…</p></div> : page === 'Overview' ? <>
          <div className="metrics"><Metric title="Reported usage" value={number(summary.reported)} caption="Known model-call counts from telemetry" icon={<Check size={17}/>} tone="reported"/><Metric title="Visible-text estimates" value={number(summary.estimated)} caption="Observed messages · cl100k_base approximation" icon={<Sparkles size={17}/>} tone="estimated"/><article className="metric"><div className="metric-title">Agent model calls<GitBranch size={17}/></div><div className="metric-value">{summary.modelCalls}<small>calls</small></div><div className="metric-caption">{summary.toolCalls} tool executions · {summary.sessions} sessions</div></article></div>
          <div className="overview-grid"><UsageChart events={filtered} days={days}/><section className="coverage-panel"><div className="section-kicker"><ShieldCheck size={17}/> MEASUREMENT COVERAGE</div><h2>Know what you’re<br/>looking at.</h2><div className="coverage-line"><span className="legend-dot reported"/><div><strong>Reported</strong><p>Usage emitted by imported telemetry.</p></div></div><div className="coverage-line"><span className="legend-dot estimated"/><div><strong>Estimated</strong><p>Visible text, locally tokenized.</p></div></div><div className="coverage-line"><span className="legend-dot unknown"/><div><strong>Unknown</strong><p>Hidden context and unavailable fields.</p></div></div><div className="coverage-footer">{summary.unknownCalls} calls without usage · {summary.partialCalls} with partial usage</div></section></div>
          <section className="panel"><div className="section-heading"><div><h2>Recent sessions</h2><p>The conversations behind the numbers.</p></div><button className="text-button" onClick={() => setPage('Sessions')}>View all sessions <ArrowRight size={15}/></button></div><SessionTable sessions={sessions.slice(0, 5)} onSelect={setSession}/>{!sessions.length && <EmptyState sample={() => setSample(true)} connect={togglePermission}/>}</section>
          <div className="accuracy-note"><Leaf size={16}/><span>Clear numbers, honest limits. Estimates exclude hidden context. Cache and reasoning subsets are never added twice.</span></div>
        </> : page === 'Sessions' ? <section className="panel"><div className="section-heading"><h2>Session history <span className="count-label">{sessions.length}</span></h2><label className="search"><Search size={16}/><input placeholder="Find a session…" aria-label="Search sessions" value={search} onChange={e => setSearch(e.target.value)}/></label></div><SessionTable sessions={sessions.filter(s => `${sessionName(s.id)} ${s.id} ${platformLabel(s.last)}`.toLowerCase().includes(search.toLowerCase()))} onSelect={setSession}/>{!sessions.length && <EmptyState sample={() => setSample(true)} connect={togglePermission}/>}</section> : page === 'Trace explorer' ? <TraceExplorer events={filtered}/> : page === 'Prompt inspector' ? <Inspector/> : <>
          <section className="panel settings-panel"><div className="section-heading"><div><h2>Collection & privacy</h2><p>Settings apply immediately to this app’s local store.</p></div><ShieldCheck size={22}/></div>
            {extension() && <SettingRow title="Collect visible ChatGPT messages" detail="Pause collection without removing existing records."><Toggle label="Capture enabled" checked={settings.captureEnabled} onChange={value => updateSettings({ ...settings, captureEnabled: value })}/></SettingRow>}
            <SettingRow title={extension() ? 'Save raw conversation text' : 'Keep optional text from imports'} detail="Off by default. Turning this off also removes text from existing records. Telemetry imports always discard prompt and tool content."><Toggle label="Save raw text" checked={settings.rawText} onChange={value => updateSettings({ ...settings, rawText: value })}/></SettingRow>
            <SettingRow title="Keep local history" detail="Expired records are permanently removed when the store is read or updated."><select aria-label="Retention period" value={settings.retentionDays} onChange={e => updateSettings({ ...settings, retentionDays: Number(e.target.value) })}>{[7, 30, 90, 365, 0].map(n => <option key={n} value={n}>{n ? `${n} days` : 'Until I delete it'}</option>)}</select></SettingRow>
          </section>
          <section className="panel settings-panel"><div className="section-heading"><div><h2>Source integrations</h2><p>Connect only the sources you choose.</p></div><Globe size={21}/></div><SettingRow title="ChatGPT browser collector" detail={extension() ? health : 'The browser companion keeps its own local store. Import its JSON export here to combine usage.'}>{extension() ? <button className="button secondary" onClick={togglePermission}>{permission ? 'Remove access' : 'Enable access'}<ArrowUpRight size={14}/></button> : <Badge>Browser extension</Badge>}</SettingRow><SettingRow title="VS Code / Copilot" detail="Import a configured OpenTelemetry JSONL file or a PromptPulse JSON export."><button className="button secondary" onClick={() => file.current?.click()}>Import file<Upload size={14}/></button></SettingRow><SettingRow title="VS Code & Antigravity IDE" detail="The editor extension provides a native sidebar, live selection estimates and optional telemetry-file watching. Native Antigravity agent tokens are unavailable."><Badge>Editor extension</Badge></SettingRow><SettingRow title="Claude, Gemini & Grok" detail="Additional browser chatbot adapters are planned."><Badge>Coming later</Badge></SettingRow></section>
          <section className="panel settings-panel"><div className="section-heading"><div><h2>Local data</h2><p>{saved.length} records saved on this device. Export includes metadata and counts; raw text is excluded.</p></div><Database size={21}/></div><SettingRow title="Delete all usage records" detail="Deletes this store’s records and pauses collection. Other extensions keep independent stores."><button className="button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>Delete data</button></SettingRow></section>
        </>}
        <footer className="page-footer"><span>PromptPulse <span className="footer-dot">·</span> A little more clarity.</span><span>Local first. No outbound analytics.</span></footer>
      </main>
    </div>
    {session && <div className="modal-backdrop" onClick={() => setSession(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Session records" onClick={e => e.stopPropagation()}><div className="section-heading"><div><h2>{sessionName(session)}</h2><p>{session}</p></div><button className="icon-button" aria-label="Close session" onClick={() => setSession(null)}><X size={20}/></button></div><div className="event-list">{events.filter(e => e.sessionId === session).map(event => <EventDetails key={event.eventId} event={event}/>)}</div></section></div>}
    {confirmDelete && <div className="modal-backdrop"><section className="modal small" role="dialog" aria-modal="true" aria-label="Delete local usage"><Trash2 size={26}/><h2>Delete local usage?</h2><p>This permanently deletes {saved.length} saved records from this store and pauses collection. Export your data first if you want a copy.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setConfirmDelete(false)}>Keep data</button><button className="button danger" onClick={deleteAll}>Delete & pause</button></div></section></div>}
  </div>;
}

function EmptyState({ sample, connect }: { sample: () => void; connect: () => void }) {
  return <div className="empty"><span className="empty-icon"><Activity size={28}/></span><h2>Your first insight starts here.</h2><p>Enable the ChatGPT extension or import Copilot telemetry.<br/>Your usage will appear here, with every measurement labeled.</p><div className="dialog-actions"><button className="button primary" onClick={connect}>Connect ChatGPT <ArrowUpRight size={14}/></button><button className="button secondary" onClick={sample}>Explore sample data</button></div></div>;
}
function UsageChart({ events, days }: { events: TokenEvent[]; days: number }) {
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(); day.setDate(day.getDate() - days + 1 + i); day.setHours(0, 0, 0, 0);
    return { day, ...summarize(events.filter(e => new Date(e.timestamp).toDateString() === day.toDateString())) };
  });
  const max = Math.max(100, ...series.flatMap(s => [s.reported, s.estimated]));
  return <section className="panel chart-panel"><div className="section-heading"><div><h2>Usage over time</h2><p>Two measurements. Their own stories.</p></div><div className="chart-legend"><span><i className="legend-dot reported"/>Reported</span><span><i className="legend-dot estimated"/>Estimated</span></div></div><div className="chart-axis-title">Known tokens per day</div><div className="chart-area"><div className="y-axis">{[1, .75, .5, .25, 0].map(n => <span key={n}>{compact(Math.round(max * n))}</span>)}</div><div className="chart-bars">{[0, 1, 2, 3, 4].map(n => <div key={n} className="gridline" style={{ top: `${n * 25}%` }}/>) }{series.map((s, i) => <div key={i} className="bar-group" title={`${s.day.toLocaleDateString()}: ${number(s.reported)} reported, ${number(s.estimated)} estimated`}><div className="bar-pair"><div className="bar reported" style={{ height: `${s.reported / max * 100}%` }}/><div className="bar estimated" style={{ height: `${s.estimated / max * 100}%` }}/></div><span className="x-label">{days <= 7 || i % 5 === 0 || i === days - 1 ? s.day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span></div>)}</div></div><div className="chart-caption">Date · {days === 1 ? 'today' : `past ${days} days`} in your local timezone. Known fields only; estimates are not billed usage.</div></section>;
}
type Session = { id: string; records: TokenEvent[]; summary: ReturnType<typeof summarize>; last: TokenEvent };
function SessionTable({ sessions, onSelect }: { sessions: Session[]; onSelect: (id: string) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>SESSION</th><th>SOURCE</th><th>REPORTED TOKENS</th><th>ESTIMATED TOKENS</th><th>LAST OBSERVED</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}><td><button className="session-button" onClick={() => onSelect(s.id)}><span className={`source-icon ${s.last.platform}`}>{s.last.platform === 'vscode' ? <Terminal size={17}/> : <Globe size={17}/>}</span><span><strong>{sessionName(s.id)}</strong><small>{s.records.length} records · {s.summary.modelCalls || s.records.filter(e => e.kind === 'message').length} {s.summary.modelCalls ? 'model calls' : 'messages'}</small></span></button></td><td><Badge>{platformLabel(s.last)}</Badge></td><td className="number-cell">{s.records.some(e => e.kind === 'model_call' && knownTokens(e) !== null && e.measurement !== 'estimated') ? number(s.summary.reported) : '—'}</td><td className="number-cell muted">{s.records.some(e => e.measurement === 'estimated') ? number(s.summary.estimated) : '—'}</td><td className="date-cell">{dateLabel(s.last.timestamp)}</td><td><button className="icon-button" aria-label={`Open ${sessionName(s.id)}`} onClick={() => onSelect(s.id)}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table></div>;
}
function EventDetails({ event }: { event: TokenEvent }) {
  const tokens = knownTokens(event);
  return <article className="event-detail"><div className="event-detail-title"><strong>{event.name}</strong><Badge tone={sourceLabel(event).toLowerCase()}>{sourceLabel(event)}</Badge></div><div className="detail-grid"><span>Input<strong>{event.inputTokens === null ? 'Unknown' : number(event.inputTokens)}</strong></span><span>Output<strong>{event.outputTokens === null ? 'Unknown' : number(event.outputTokens)}</strong></span><span>Cache subset<strong>{event.cachedInputTokens === null ? 'Unknown' : number(event.cachedInputTokens)}</strong></span><span>Reasoning subset<strong>{event.reasoningTokens === null ? 'Unknown' : number(event.reasoningTokens)}</strong></span></div><p>{event.kind === 'agent' || event.kind === 'tool' ? 'Excluded from token totals.' : `Known tokens: ${tokens === null ? 'unavailable' : number(tokens)}.`} {event.durationMs === null ? 'Duration unknown.' : `Duration: ${event.durationMs} ms.`}</p><div className="coverage-tags">{event.coverage.map(note => <span key={note}>{note}</span>)}</div>{event.estimator && <p>Estimator: {event.estimator}</p>}<details><summary>Source metadata</summary><pre>{JSON.stringify({ eventId: event.eventId, traceId: event.traceId, spanId: event.spanId, model: event.model, status: event.status, rawUsage: event.rawUsage }, null, 2)}</pre></details>{event.text !== undefined && <details><summary>Opt-in saved text</summary><pre>{event.text}</pre></details>}</article>;
}
function TraceExplorer({ events }: { events: TokenEvent[] }) {
  const ids = [...new Set(events.filter(e => e.traceId).map(e => e.traceId!))];
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const active = selected && ids.includes(selected) ? selected : ids[0];
  const spans = events.filter(e => e.traceId === active);
  const nodes = buildTrace(spans);
  const event = spans.find(e => e.eventId === focus);
  return <section className="panel"><div className="section-heading"><div><h2>Agent execution traces</h2><p>Model-call totals only. Parent summaries and tool steps remain visible.</p></div><Badge>{ids.length} traces</Badge></div>{!ids.length ? <div className="empty"><GitBranch size={32}/><h2>Follow your first agent task.</h2><p>Import a Copilot OpenTelemetry JSONL file to see model calls,<br/>tools, and subagents in their execution hierarchy.</p></div> : <><div className="trace-layout"><div className="trace-sidebar">{ids.map(id => <button key={id} className={active === id ? 'selected' : ''} onClick={() => { setSelected(id); setFocus(null); }}><GitBranch size={16}/><div><strong>{id.startsWith('sample') ? `Sample agent task ${Number(id.split('-').at(-1)) + 1}` : `Trace ${id.slice(0, 10)}`}</strong><small>{summarize(events.filter(e => e.traceId === id)).modelCalls} model calls</small></div><ChevronRight size={14}/></button>)}</div><div className="trace-tree"><div className="trace-summary"><Badge tone="reported">{number(summarize(spans).reported)} known reported tokens</Badge><Badge>{summarize(spans).toolCalls} tool steps</Badge></div>{nodes.map(node => <TraceBranch key={node.event.eventId} node={node} onSelect={setFocus} focus={focus} depth={0}/>)}</div></div>{event && <div className="trace-inspector"><EventDetails event={event}/></div>}</>}</section>;
}
function TraceBranch({ node, onSelect, focus, depth }: { node: TraceNode; onSelect: (id: string) => void; focus: string | null; depth: number }) {
  const [open, setOpen] = useState(true);
  return <div className="trace-branch"><div className={`trace-node ${focus === node.event.eventId ? 'focused' : ''}`}><button className="tree-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${node.event.name}`} onClick={() => setOpen(!open)} disabled={!node.children.length}>{node.children.length ? open ? <ChevronDown size={14}/> : <ChevronRight size={14}/> : <span className="tree-dot"/>}</button><button className="node-select" onClick={() => onSelect(node.event.eventId)}>{node.event.kind === 'tool' ? <Terminal size={16}/> : node.event.kind === 'agent' ? <GitBranch size={16}/> : <Sparkles size={16}/>}<span>{node.event.name}<small>{node.diagnostics.join(' · ') || node.event.status}</small></span><strong>{knownTokens(node.event) === null ? '—' : `${number(knownTokens(node.event)!)} tokens`}</strong></button></div>{open && depth < 30 && node.children.length > 0 && <div className="trace-children">{node.children.map(child => <TraceBranch key={child.event.eventId} node={child} onSelect={onSelect} focus={focus} depth={depth + 1}/>)}</div>}{depth >= 30 && node.children.length > 0 && <p className="muted">Deeper spans are available in the export.</p>}</div>;
}
function Inspector() {
  const [draft, setDraft] = useState('');
  const [alternate, setAlternate] = useState('');
  const [budget, setBudget] = useState(4096);
  const a = useMemo(() => estimateTokens(draft), [draft]);
  const b = useMemo(() => estimateTokens(alternate), [alternate]);
  return <><div className="inspector-grid">{[{ label: 'Original draft', text: draft, set: setDraft, tokens: a }, { label: 'Alternate draft', text: alternate, set: setAlternate, tokens: b }].map(item => <section className="panel draft-panel" key={item.label}><div className="section-heading"><h2>{item.label}</h2><Badge tone="estimated">Estimated</Badge></div><textarea aria-label={item.label} placeholder="Paste a prompt or code snippet…" value={item.text} onChange={e => item.set(e.target.value)} maxLength={100000}/><div className="draft-footer"><strong>{number(item.tokens)}<small> tokens</small></strong><span>{number(item.text.length)} characters</span></div></section>)}</div><section className="panel inspector-summary"><div><h2>Make room for the answer.</h2><p>Counts run locally in memory. These drafts are never saved.</p></div><div className="comparison"><strong>{alternate && draft ? `${a - b >= 0 ? '−' : '+'}${number(Math.abs(a - b))}` : '—'}</strong><span>estimated token difference</span></div><label>Visible-text budget<select aria-label="Prompt token budget" value={budget} onChange={e => setBudget(Number(e.target.value))}>{[1024, 4096, 8192, 32768].map(n => <option key={n} value={n}>{number(n)} tokens</option>)}</select></label><div className="budget-track"><span style={{ width: `${Math.min(100, a / budget * 100)}%` }}/></div><p>{a > budget ? 'Original draft exceeds your selected text budget.' : `${number(Math.max(0, budget - a))} estimated tokens remaining in your selected text budget.`} This is not the model’s actual remaining context.</p></section><div className="accuracy-note"><CircleHelp size={16}/><span>{ESTIMATOR}. Model approximation only; excludes hidden instructions, files, tool context, and billing overhead. Shorter prompts may change answer quality.</span></div></>;
}
function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{title}</strong><p>{detail}</p></div><div>{children}</div></div>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span/></button>; }
