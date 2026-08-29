module.exports = {
  preset: 'react-native',
  // Project keys REPLACE preset keys wholesale, so re-declare the preset's own
  // setup file alongside ours — dropping it would silently lose RN's global
  // mocks. jest.setup.js initializes the real i18next singleton with the
  // Spanish bundle so t() returns the exact literals tests already assert.
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
  // The react-native preset's transform pattern omits .jsx (it only matches
  // js|ts|tsx), but this codebase is .jsx everywhere — re-declare the transform
  // with jsx added, keeping the preset's asset transformer.
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf)$': require.resolve(
      'react-native/jest/assetFileTransformer.js',
    ),
  },
  // El preset ignora todo node_modules salvo react-native*, pero
  // number-flow-react-native publica ESM (lib/module) y TS (src) sin compilar a
  // CJS: sin esta excepción cualquier suite que lo importe de verdad revienta
  // con "Cannot use import statement outside a module".
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|number-flow-react-native)/)',
  ],
};
