const { resolveRelativeEntryPoint, getMetroServerRoot } = require('@expo/config/paths');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
console.log('  projectRoot:', projectRoot);
console.log('  metroServerRoot:', getMetroServerRoot(projectRoot));
console.log('  bundleEntry:', resolveRelativeEntryPoint(projectRoot, { platform: 'android' }));
