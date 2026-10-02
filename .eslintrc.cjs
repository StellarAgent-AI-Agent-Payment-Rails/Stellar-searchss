module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^', varsIgnorePattern: '^' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-console': 'off',
    'no-console': 'off',
    // `while (true) { ... break }` is an intentional pattern in the SSE readers.
    'no-constant-condition': ['error', { checkLoops: false }],
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.c', '/*.config.js'],
  overrides: [
    {
      files: ['*.cjs', '*.js'],
      env: { node: true },
      parserOptions: { sourceType: 'script' },
    },
  ],
};
