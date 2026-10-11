const { buildConfig } = require('./scripts/build-config.cjs');
module.exports = ({ config }) => buildConfig(config);
