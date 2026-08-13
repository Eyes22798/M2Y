const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = defineConfig([
  expoConfig,
  reactHooks.configs.flat['recommended-latest'],
  {
    ignores: ['android/**', 'ios/**', 'dist/**', '.expo/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['jest.setup.js', '**/*.test.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
]);
