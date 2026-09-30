import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyRelease } from '../scripts/verify-release.mjs';

it('checks the installer digest and refuses mismatched release assets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamchat-release-'));
  try {
    const installer = 'test installer';
    const digest = createHash('sha512').update(installer).digest('base64');
    const metadata = {
      version: '0.5.0', path: 'StreamChat-Setup-0.5.0.exe', sha512: digest,
      files: [{ url: 'StreamChat-Setup-0.5.0.exe', size: installer.length, sha512: digest }],
    };
    await writeFile(join(dir, metadata.path), installer);
    await writeFile(join(dir, metadata.path + '.blockmap'), 'test blockmap');
    await writeFile(join(dir, 'latest.yml'), JSON.stringify(metadata));
    expect(await verifyRelease(dir, '0.5.0')).toMatchObject({ verified: true, version: '0.5.0' });
    await expect(verifyRelease(dir, '0.5.1')).rejects.toThrow('version');
    await writeFile(join(dir, 'latest.yml'), JSON.stringify({ ...metadata, path: '../wrong.exe' }));
    await expect(verifyRelease(dir, '0.5.0')).rejects.toThrow('expected Windows installer');
    await writeFile(join(dir, 'latest.yml'), JSON.stringify(metadata));
    await writeFile(join(dir, metadata.path), 'same size evil');
    await expect(verifyRelease(dir, '0.5.0')).rejects.toThrow('checksum');
    await writeFile(join(dir, metadata.path), 'short');
    await expect(verifyRelease(dir, '0.5.0')).rejects.toThrow('size');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
