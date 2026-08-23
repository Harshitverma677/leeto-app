const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Tell Metro compiler to completely ignore the backend-worker folder
config.resolver.blockList = [
  /backend-worker\/.*/,
];

module.exports = config;