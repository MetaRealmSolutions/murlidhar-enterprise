import pkg from '../../package.json';

// Version numbers come from package.json only (app.config.js feeds the same values to the Android build), so the Settings page, the
// Android app and the Windows installer cannot disagree. Three different things:
//   RELEASE_VERSION  what people are told ("1.0")
//   PACKAGE_VERSION  the technical version ("1.0.0")
//   BUILD_NUMBER     a whole number that goes up with every build
export const APP_NAME = 'Murlidhar Enterprise';
export const RELEASE_VERSION: string = pkg.releaseVersion;
export const PACKAGE_VERSION: string = pkg.version;
export const BUILD_NUMBER: number = pkg.buildNumber;

/** Who made the software. This is the software company, never the client's business. */
export const DEVELOPER = {
  name: 'MetaRealm Technologies Pvt. Ltd.',
  email: 'contact@metarealm.co.in',
  phone: '+91 78620 44622',
  copyright: '© 2026 MetaRealm Technologies Pvt. Ltd. All rights reserved.',
};
