const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const previous = config.resolver.blockList;

// Metro kan kompilera valfri JSON-ingång via bundleEntry, inte bara appens
// importer. Git-ignore skyddar därför inte sessionsnycklar från Expo Tunnel.
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  // Expo kräver samma regex-flaggor som standardlistan. Teckenklasser ger
  // Windows skiftlägesokänsliga skydd utan att ändra standarduttrycken.
  /(?:^|[\\/])(?:\.[tT][mM][pP]|\.[gG][iI][tT])(?:[\\/]|$)/,
  /(?:^|[\\/])\.[eE][nN][vV](?:\.[^\\/]*)?$/,
];

module.exports = config;
