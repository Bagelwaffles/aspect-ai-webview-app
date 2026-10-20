import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
const host = 'ams-owner-gmail-preview-ams-owner-preview.b.aivencloud.com';
try {
  await lookup(host);
  console.log('PASS: Aiven DNS');
  await new Promise((resolve, reject) => {
    const socket = connect({host, port:23873});
    socket.setTimeout(8000);
    socket.once('connect', () => {socket.destroy(); resolve();});
    socket.once('timeout', () => {socket.destroy(); reject(new Error('TIMEOUT'));});
    socket.once('error', reject);
  });
  console.log('PASS: Aiven TCP');
} catch (error) {
  console.log('BLOCKED: connectivity ' + (/^[A-Z_]+$/.test(error.code || '') ? error.code : 'FAILED'));
  process.exitCode = 1;
}
