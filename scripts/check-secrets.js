const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  { name: 'Supabase secret key (sb_secret_)', regex: /sb_secret_[a-zA-Z0-9_\-]+/ },
  { name: 'Supabase publishable key (sb_publishable_)', regex: /sb_publishable_[a-zA-Z0-9_\-]+/ },
  { name: 'Service role key assignment', regex: /service_role[a-zA-Z0-9_\s]*[:=]\s*['"][a-zA-Z0-9_\-\.]{20,}['"]/i },
  { name: 'Resend API key', regex: /re_[a-zA-Z0-9]{24,36}\b/ },
];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.data', '.venv', 'venv', '__pycache__', 'dist', 'build']);
const IGNORED_FILES = new Set(['.env', '.env.local', '.env.production', '.env.development', '.env.example']);

let violations = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name) || entry.name.startsWith('.env.')) continue;
      // Skip binary files and archives
      if (/\.(png|jpg|jpeg|gif|ico|pdf|zip|tar|gz|xlsx|pyc)$/i.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, lineIdx) => {
        for (const pat of SECRET_PATTERNS) {
          if (pat.regex.test(line)) {
            console.error(`[SECURITY ERROR] ${pat.name} detected in ${fullPath}:${lineIdx + 1}`);
            violations++;
          }
        }
      });
    }
  }
}

console.log('Running secret leak pre-commit check...');
scanDir('.');

if (violations > 0) {
  console.error(`\nFAILED: Found ${violations} secret leak violation(s). Remove all hardcoded credentials!`);
  process.exit(1);
} else {
  console.log('SUCCESS: No secrets detected in codebase.');
  process.exit(0);
}
