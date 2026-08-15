module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Work around a version-interop crash in @typescript-eslint/no-unused-expressions.
    '@typescript-eslint/no-unused-expressions': 'off',
    'no-unused-expressions': 'off',
  },
};
