import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const readmePath = path.join(root, 'README.md');
const filenames = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
const readme = await readFile(readmePath, 'utf8');
const listed = [...readme.matchAll(/supabase\/migrations\/([\w.-]+\.sql)/g)].map(match => match[1]);
const expectedLast = '20261023000001_hub_split_and_auth_lockdown.sql';
const errors = [];
if (JSON.stringify(listed) !== JSON.stringify(filenames)) errors.push(`README migration list differs from supabase/migrations. Folder: ${filenames.join(', ')}; README: ${listed.join(', ')}`);
if (filenames.at(-1) !== expectedLast) errors.push(`${expectedLast} must be the last migration (found ${filenames.at(-1) || 'none'}).`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Migration order is valid (${filenames.length} files).`);
