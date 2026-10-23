'use client';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui';

type Profile = { user_id: string; name: string; email: string; role: string };
const roles = ['pending', 'demand', 'warehouse', 'management'];
export default function UsersSettingsPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/settings/users'); const data = await response.json();
    if (!response.ok) setError(response.status === 403 ? 'Management access is required.' : data.error || 'Unable to load users.');
    else { setError(''); setUsers(data.users); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (userId: string, role: string) => {
    const response = await fetch('/api/settings/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) });
    const data = await response.json();
    if (!response.ok) setError(data.error || 'Unable to save role.'); else await load();
  };
  if (error === 'Management access is required.') return <p role="alert" className="text-xs text-[var(--text-muted)]">Management access is required to view user access settings.</p>;
  return <div className="space-y-6 pb-16 max-w-5xl"><PageHeader title="User Access" subtitle="Review accounts and assign dashboard roles." breadcrumbs={[{ label: 'Aksharveda Ops', href: '/pos' }, { label: 'Settings' }, { label: 'Users' }]} />
    {error && <p role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs">{error}</p>}
    {loading ? <p className="text-xs text-[var(--text-muted)]">Loading users…</p> : users.length === 0 && !error ? <p className="text-xs text-[var(--text-muted)]">No user profiles found.</p> : <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Action</th></tr></thead><tbody>{users.map(user => <UserRow key={user.user_id} user={user} onSave={save} />)}</tbody></table></div>}
  </div>;
}
function UserRow({ user, onSave }: { user: Profile; onSave: (id: string, role: string) => Promise<void> }) {
  const [role, setRole] = useState(user.role);
  return <tr className="border-b last:border-0 border-[var(--border-subtle)]"><td className="p-3 text-[var(--text-primary)]">{user.name}</td><td className="p-3 text-[var(--text-secondary)]">{user.email || '—'}</td><td className="p-3"><select value={role} onChange={e => setRole(e.target.value)} className="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)]">{roles.map(r => <option key={r} value={r}>{r}</option>)}</select></td><td className="p-3"><button onClick={() => void onSave(user.user_id, role)} className="px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-500">Save</button></td></tr>;
}
