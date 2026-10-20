// Owner-operated only. Never run in Actions or print a key.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
const [mode, keyPath, proofPath] = process.argv.slice(2);
function outsideRepo(path) {
  const target = resolve(realpathSync(dirname(resolve(path))), resolve(path).split(/[\\/]/).pop());
  const rel = relative(resolve(import.meta.dirname, '../..'), target);
  if (!rel.startsWith('..')) throw new Error('KEY_MUST_BE_OUTSIDE_REPOSITORY');
  return target;
}
try {
  if (!['generate', 'verify'].includes(mode) || !keyPath || !proofPath || process.env.GITHUB_ACTIONS) throw new Error('OWNER_LOCAL_USE_ONLY');
  const destination = outsideRepo(keyPath);
  if (mode === 'generate') {
    const key = randomBytes(32), iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update('AMS owner Preview recovery check v1', 'utf8'), cipher.final()]);
    // wx refuses to overwrite any prior key or proof.
    writeFileSync(destination, key.toString('base64') + '\n', {mode:0o600, flag:'wx'});
    writeFileSync(proofPath, JSON.stringify({iv:iv.toString('base64'), data:data.toString('base64'), tag:cipher.getAuthTag().toString('base64')}), {mode:0o600, flag:'wx'});
    key.fill(0);
    console.log('Key written privately. Save in Bitwarden, lock/unlock the vault, then recover into a DIFFERENT local file and run verify. No Vercel configuration authorized by this helper.');
  } else {
    const raw = readFileSync(destination,'utf8').trim();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error('INVALID_RECOVERED_KEY');
    const key = Buffer.from(raw,'base64');
    const proof = JSON.parse(readFileSync(proofPath,'utf8'));
    const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(proof.iv,'base64'));
    decipher.setAuthTag(Buffer.from(proof.tag,'base64'));
    const clear = Buffer.concat([decipher.update(Buffer.from(proof.data,'base64')),decipher.final()]).toString('utf8');
    key.fill(0);
    if (clear !== 'AMS owner Preview recovery check v1') throw new Error('RECOVERY_CHECK_FAILED');
    console.log('PASS: recovered key decrypts the synthetic recovery proof. Owner must attest the recovered file came from the saved Bitwarden item.');
  }
} catch {
  console.error('BLOCKED: owner key operation failed; secret values suppressed. Check arguments, permissions and that output files do not already exist.');
  process.exitCode = 1;
}
