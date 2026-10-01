import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import iconOnlyControl from './eslint-rules/a11y-icon-only-control.js'

/** Repo-local rules that fill the gaps jsx-a11y leaves on icon-only controls. */
const local = {
  rules: { 'a11y-icon-only-control': iconOnlyControl },
}

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'api/',
      'server/',
      'mcp-server/',
      'scripts/',
      '*.config.js',
      '*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      local,
    },
    settings: { react: { version: '18.2' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // The new JSX transform makes these obsolete.
      'react/react-in-jsx-scope': 'off',
      // Props are typed; the rule only understands propTypes.
      'react/prop-types': 'off',

      // Issue #188: every interactive control must expose an accessible name.
      // `local/a11y-icon-only-control` is the rule that actually catches a
      // button whose only child is an icon component — jsx-a11y treats that
      // child as content and stays silent. The jsx-a11y rules below cover
      // inputs and structural a11y regressions.
      'local/a11y-icon-only-control': ['error', { elements: ['button', 'motion.button'] }],
      'jsx-a11y/control-has-associated-label': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }],
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/scope': 'error',

      // Pre-existing debt that this a11y PR deliberately does not touch.
      // Kept as warnings so `npm run lint` stays green and the codebase keeps
      // building up a backlog instead of a wall of errors.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'off',

      // Unused vars: warn, not error, so an in-progress edit can't break CI.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off',
    },
  },
)
