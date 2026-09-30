import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');

export async function verifyRelease(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric release version');
  const name = `StreamChat-Setup-${version}.exe`;
  const metadata = parseUpdateInfo(await readFile(join(directory, 'latest.yml'), 'utf8'),
    'latest.yml', 'https://github.com/Flumbus/stream-chat/releases');
  if (metadata?.version !== version) throw new Error('Release version does not match package.json');
  if (metadata.files?.length !== 1 || metadata.files[0].url !== name || metadata.path !== name)
    throw new Error('Release metadata must point to the expected Windows installer');
  const installer = join(directory, name);
  const size = (await stat(installer)).size;
  if (!size || size !== metadata.files[0].size) throw new Error('Installer size does not match latest.yml');
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  const digest = hash.digest('base64');
  if (digest !== metadata.sha512 || digest !== metadata.files[0].sha512)
    throw new Error('Installer checksum does not match latest.yml');
  if (!(await stat(installer + '.blockmap')).size) throw new Error('Installer blockmap is empty');
  return { version, installer: name, size, verified: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(JSON.stringify(await verifyRelease(resolve('release'), version)));
}
