/**
 * Monorepo root metro.config.js
 *
 * When the Android Gradle build invokes Expo CLI with the working directory set
 * to the monorepo root, Metro's config resolver looks for metro.config.js at
 * exactly this location. Without this file it falls back to a blank default
 * config that sets projectRoot to the monorepo root.
 *
 * By forwarding to mobile/metro.config.js, __dirname inside that file is
 * "mobile/", so getDefaultConfig(__dirname) and server.unstable_serverRoot
 * are both anchored to mobile/ — the correct project root.
 */
module.exports = require('./mobile/metro.config.js');
