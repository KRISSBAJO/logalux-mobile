const base = require('./app.json').expo;
const fs = require('node:fs');
// Keep store identifiers aligned with the existing Apple and Google app records.
// Release builds refuse missing identifiers and localhost addresses before consuming a build.
module.exports = ({ config }) => {
  const release = Boolean(process.env.EAS_BUILD_PROFILE);
  const bundleIdentifier = process.env.LOGALUXE_IOS_BUNDLE_ID || 'com.logaluxe.com.logaLuxeClient';
  const androidPackage = process.env.LOGALUXE_ANDROID_PACKAGE;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  if (release) {
    for (const name of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_URL']) {
      const value = process.env[name];
      if (!value || !/^https:\/\//.test(value) || /localhost|127\.0\.0\.1/.test(value)) {
        throw new Error(`${name} must be the verified public HTTPS address before building.`);
      }
    }
    if (!bundleIdentifier || !androidPackage) throw new Error('Set both verified store application identifiers before building.');
    if (process.env.EAS_BUILD_PLATFORM === 'android' && !fs.existsSync(googleServicesFile)) throw new Error('Android push requires the Firebase google-services.json file.');
  }
  return {
    ...config,
    ...base,
    owner: 'gatherplus',
    ios: { ...base.ios, ...(bundleIdentifier ? { bundleIdentifier } : {}) },
    android: { ...base.android, ...(androidPackage ? { package: androidPackage } : {}), ...(fs.existsSync(googleServicesFile) ? { googleServicesFile } : {}) },
    plugins: [...base.plugins, ['expo-notifications', { color: '#D4AF5A' }]],
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: 'https://u.expo.dev/d748606a-e451-4c18-bd77-c1d254a34c85', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
    extra: { ...base.extra, eas: { projectId: 'd748606a-e451-4c18-bd77-c1d254a34c85' } },
  };
};
