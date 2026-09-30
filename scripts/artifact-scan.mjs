import { Buffer } from 'node:buffer';
import { listPackage, extractFile, statFile } from '@electron/asar';
import { readFileSync, existsSync } from 'node:fs';
const archive = 'release/win-unpacked/resources/app.asar';
const secrets = existsSync('.env')
  ? readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^(GOOGLE_CLIENT_SECRET|YOUTUBE_API_KEY|.*TOKEN|.*PRIVATE_KEY)=/.test(line))
      .map((line) =>
        line
          .slice(line.indexOf('=') + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ''),
      )
      .filter((value) => value.length > 8)
  : [];
const failures = [];
let files = 0;
for (const entry of listPackage(archive)) {
  const name = entry.replace(/^[/\\]/, '').replaceAll('\\', '/');
  const info = statFile(archive, entry.slice(1), false);
  if (info.files || info.link) continue;
  files++;
  if (/(?:^|\/)\.env(?:$|\.)|\.(?:sqlite|db|pfx|p12|pem)$/i.test(name))
    failures.push({ file: name, rule: 'private-file' });
  const data = extractFile(archive, entry.slice(1), false);
  if (secrets.some((value) => data.includes(Buffer.from(value))))
    failures.push({ file: name, rule: 'local-secret' });
  if (
    !name.startsWith('node_modules/') &&
    /GOCSPX-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}/.test(
      data.toString('utf8'),
    )
  )
    failures.push({ file: name, rule: 'credential-pattern' });
}
console.log(JSON.stringify({ archive, files, passed: failures.length === 0, failures }));
if (failures.length) process.exitCode = 1;
