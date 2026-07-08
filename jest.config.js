module.exports = {
  preset: 'react-native',
  // The react-native preset's transform pattern omits .jsx (it only matches
  // js|ts|tsx), but this codebase is .jsx everywhere — re-declare the transform
  // with jsx added, keeping the preset's asset transformer.
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      'react-native/jest/assetFileTransformer.js',
    ),
  },
};
