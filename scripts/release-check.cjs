// Run before spending either store-build credit. Never prints credentials.
const fs = require('node:fs');
async function main() {
  for (const name of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL']) {
    const address = new URL(process.env[name] || 'http://localhost');
    if (address.protocol !== 'https:' || /localhost|127\.0\.0\.1/.test(address.hostname)) throw new Error(`${name} needs a public HTTPS address.`);
    const path = name === 'EXPO_PUBLIC_API_URL' ? '/health' : '/';
    const result = await fetch(new URL(path, address), { signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error(`${name} failed its availability check (${result.status}).`);
    if (name === 'EXPO_PUBLIC_API_URL') {
      const body = await result.json();
      if (body.status !== 'ok' && body.ok !== true) throw new Error('API health response did not confirm readiness.');
    }
  }
  if (!process.env.LOGALUXE_ANDROID_PACKAGE) throw new Error('The verified Android store identifier is required.');
  const firebase = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICES_JSON || './google-services.json', 'utf8'));
  if (!firebase.client?.some(c => c.client_info?.android_client_info?.package_name === process.env.LOGALUXE_ANDROID_PACKAGE)) throw new Error('Firebase configuration does not match the Android package.');
  console.log('Public hosts, store identifiers and Android Firebase configuration passed. Signing credentials still require verification in EAS.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
