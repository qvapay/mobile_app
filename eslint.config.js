const reactNativeConfig = require('@react-native/eslint-config/flat');

// ESLint 10 flat config. The React Native shared config is consumed from its
// `/flat` entry point (ESLint 9+ format) and spread into the array.
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'vendor/**',
      'coverage/**',
      'lib/**',
      'dist/**',
    ],
  },
  ...reactNativeConfig,

  // The RN shared config enables eslint-plugin-ft-flow rules for **/*.js, but
  // this app is plain JS (no Flow) and the ft-flow@2.0.3 bundled by the RN
  // config is incompatible with ESLint 9+ (uses removed context APIs). Turning
  // these rules off prevents the rule-load crash. Scoped to .js where ft-flow
  // is registered by the RN config.
  {
    files: ['**/*.js'],
    rules: {
      'ft-flow/define-flow-type': 'off',
      'ft-flow/use-flow-type': 'off',
    },
  },
];
