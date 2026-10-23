'use client';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui';

type SKU = { item_id: string; name: string; short_name: string | null; ean: string | null; display_name: string | null };
export default function SkuMasterPage() {
  const [skus, setSkus] = useState<SKU[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); const r = await fetch('/api/settings/skus'); const d = await r.json(); if (!r.ok) setError(r.status === 403 ? 'Management access is required.' : d.error || 'Unable to load SKU master.'); else { setError(''); setSkus(d.skus); } setLoading(false); };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => skus.filter(s => `${s.name} ${s.item_id} ${s.ean || ''}`.toLowerCase().includes(query.toLowerCase())), [skus, query]);
  const save = async (sku: SKU, display_name: string) => { const r = await fetch('/api/settings/skus', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: sku.item_id, display_name }) }); const d = await r.json(); if (!r.ok) setError(d.error || 'Unable to save display name.'); else setSkus(old => old.map(s => s.item_id === sku.item_id ? { ...s, display_name: d.display_name } : s)); };
  return <div className="space-y-5 pb-16"><PageHeader title="SKU Master" subtitle="Set the display names used in the dispatch grid." breadcrumbs={[{ label: 'Aksharveda Ops', href: '/pos' }, { label: 'Settings' }, { label: 'SKU Master' }]} />
    {error && <p role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs">{error}</p>}
    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search SKU name, ID or EAN" className="w-full max-w-md px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-sm text-[var(--text-primary)]" />
    {loading ? <p className="text-xs text-[var(--text-muted)]">Loading SKUs…</p> : <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]"><th className="p-3">Product</th><th className="p-3">EAN</th><th className="p-3">Display name override</th><th className="p-3" /></tr></thead><tbody>{visible.map(s => <SkuRow key={s.item_id} sku={s} save={save} />)}</tbody></table></div>}
  </div>;
}
function SkuRow({ sku, save }: { sku: SKU; save: (sku: SKU, name: string) => Promise<void> }) { const [name, setName] = useState(sku.display_name || ''); return <tr className="border-b last:border-0 border-[var(--border-subtle)]"><td className="p-3 text-[var(--text-primary)]"><div>{sku.name}</div><code className="text-[10px] text-[var(--text-muted)]">{sku.item_id}</code></td><td className="p-3 font-mono text-[var(--text-secondary)]">{sku.ean || '—'}</td><td className="p-3"><input value={name} onChange={e => setName(e.target.value)} placeholder={sku.short_name || sku.name} className="w-full min-w-48 px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]" /></td><td className="p-3"><button onClick={() => void save(sku, name)} className="px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-500">Save</button></td></tr>; }
