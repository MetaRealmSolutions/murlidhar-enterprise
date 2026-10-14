// Dynamic Expo config layered on app.json. package.json is the single source of truth for the version numbers:
//   version        package.json "version"       (technical version, 1.0.0; also what electron-builder uses for the Windows installer)
//   buildNumber    package.json "buildNumber"   (whole number, +1 for every build; Android versionCode, iOS buildNumber)
//   releaseVersion package.json "releaseVersion" (user-facing release, 1.0; shown on the Settings page)
const pkg = require('./package.json');

module.exports = ({ config }) => ({
  ...config,
  version: pkg.version,
  ios: { ...config.ios, buildNumber: String(pkg.buildNumber) },
  android: { ...config.android, versionCode: pkg.buildNumber },
  extra: { ...config.extra, releaseVersion: pkg.releaseVersion, buildNumber: pkg.buildNumber },
});
