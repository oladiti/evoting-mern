import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/backups/**', 'server/uploads/**', 'client/public/**'],
  },

  // ---- server: Node, native ESM -------------------------------------------
  {
    files: ['server/**/*.js', 'server/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Express identifies middleware by arity, not by name: `next` has to be the
  // third parameter for a 3-arg handler and the fourth for an error handler,
  // even when the body never calls it. Flagging it produces an error on every
  // middleware in the app, so unused trailing args are allowed here.
  {
    files: ['server/src/routes/**/*.js', 'server/src/middleware/**/*.js', 'server/src/controllers/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // ---- client: browser + React ---------------------------------------------
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/no-unknown-property': 'warn',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Legal and marketing copy is prose. Escaping the apostrophes in "voter's"
  // as &rsquo; makes the source unreadable for no benefit, and React renders
  // both identically. These pages are text, not code.
  //
  // This block has to come *after* the client block: flat config applies rules
  // in array order, and the client block spreads react.configs.recommended,
  // which re-enables this rule for everything it matches.
  {
    files: [
      'client/src/pages/legal/**',
      'client/src/pages/Privacy.jsx',
      'client/src/pages/Terms.jsx',
      'client/src/pages/CookiePolicy.jsx',
      'client/src/pages/Help.jsx',
      'client/src/pages/Contact.jsx',
      'client/src/pages/Features.jsx',
      'client/src/pages/Dashboard.jsx',
      'client/src/pages/NotFound.jsx',
      'client/src/pages/Login.jsx',
      'client/src/pages/ForgotPassword.jsx',
    ],
    rules: { 'react/no-unescaped-entities': 'off' },
  },

  // ---- config files themselves --------------------------------------------
  {
    files: ['**/*.config.js', '**/*.config.mjs', 'eslint.config.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },

  // ---- tests ---------------------------------------------------------------
  {
    files: ['**/*.test.js', '**/*.test.jsx', '**/tests/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
