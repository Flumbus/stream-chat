import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const gitArgs = ['-c', `safe.directory=${root.replaceAll('\\', '/')}`];
const paths = execFileSync(
  'git',
  [...gitArgs, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['google-secret', /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{30,}/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/],
];
let envSecrets = [];
if (existsSync('.env'))
  envSecrets = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^(GOOGLE_CLIENT_SECRET|YOUTUBE_API_KEY|.*TOKEN|.*PRIVATE_KEY)=/.test(l))
    .map((l) =>
      l
        .slice(l.indexOf('=') + 1)
        .trim()
        .replace(/^['"]|['"]$/g, ''),
    )
    .filter((v) => v.length > 8);
const failures = [];
let checked = 0;
for (const file of [...new Set(paths)]) {
  if (
    /(?:^|\/)(?:\.env(?:\.|$)|.*\.(?:sqlite|db|pem|pfx|p12)$)/i.test(file) &&
    !file.endsWith('.env.example')
  ) {
    failures.push({ file, rule: 'private-file' });
    continue;
  }
  const bytes = readFileSync(resolve(root, file));
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  checked++;
  for (const [rule, pattern] of patterns) if (pattern.test(text)) failures.push({ file, rule });
  if (envSecrets.some((secret) => text.includes(secret)))
    failures.push({ file, rule: 'local-secret' });
}
console.log(JSON.stringify({ checked, passed: failures.length === 0, failures }));
if (failures.length) process.exitCode = 1;
