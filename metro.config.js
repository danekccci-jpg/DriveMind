/**
 * Monorepo root metro.config.js
 *
 * When Metro is invoked with the working directory at the monorepo root,
 * it looks for metro.config.js here. Forward to mobile/metro.config.js so
 * getDefaultConfig(__dirname) uses mobile/ as the Expo project root while
 * server.unstable_serverRoot stays at the workspace root (required for
 * "mobile/index.ts" entry resolution in npm workspaces).
 */
module.exports = require('./mobile/metro.config.js');
