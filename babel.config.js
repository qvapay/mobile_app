module.exports = {
  presets: [
    ['module:@react-native/babel-preset', { enableBabelRuntime: '^7.29.7' }],
  ],
  plugins: [
    'react-native-worklets/plugin',
  ],
};
