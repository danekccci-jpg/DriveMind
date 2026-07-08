const { getDefaultConfig } = require('expo/metro-config');

/**
 * Expo monorepo Metro config for the mobile workspace.
 *
 * getDefaultConfig() already sets:
 *  - server.unstable_serverRoot → monorepo root (via getMetroServerRoot)
 *  - watchFolders / nodeModulesPaths for npm workspaces
 *
 * Do NOT override unstable_serverRoot to __dirname (mobile/): Expo resolves
 * the Android/iOS bundle entry as "mobile/index.ts" relative to the monorepo
 * root, so the server root must stay at the workspace root or Metro 404s on
 * "./mobile/index".
 */
const config = getDefaultConfig(__dirname);

// `--localhost` / default on Windows can bind Metro to [::1]:8081 (IPv6 only).
// The Android emulator fetches the bundle from 10.0.2.2:8081 (IPv4 → host loopback),
// so force IPv4 loopback or the packager status check times out and the app red-screens.
config.server = {
  ...config.server,
  host: '127.0.0.1',
};

// Reliable file watching on Windows (Fast Refresh depends on Metro seeing saves).
if (process.platform === 'win32') {
  config.watcher = {
    ...config.watcher,
    healthCheck: {
      enabled: true,
      interval: 30000,
      timeout: 10000,
    },
  };
}

module.exports = config;
