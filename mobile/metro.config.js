const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Let Metro watch the monorepo root so shared packages are visible
config.watchFolders = [monorepoRoot];

// Resolve modules from mobile/node_modules first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Pin server root to mobile/ so entry-point resolution works during
// Android Gradle builds (otherwise Metro walks up to the monorepo root).
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

module.exports = config;
