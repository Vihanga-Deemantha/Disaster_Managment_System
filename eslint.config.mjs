import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One config for the whole repo. Besides style, it enforces the architecture from the master plan:
 * layer boundaries, "modules never import each other", injected time/ids, no console, no `any`.
 *
 * ESLint replaces (it does not merge) a rule's options when a later block sets the same rule for the
 * same file. So every file below is meant to match exactly ONE `no-restricted-imports` block, and
 * each block lists the complete set of restrictions for that kind of file.
 */

const USE_CASES = ['warnings', 'resources', 'hazard-reports', 'analytics'];

const otherUseCases = (own) => USE_CASES.filter((name) => name !== own);

const crossUseCase = (own, what) =>
  otherUseCases(own).map((other) => ({
    group: [`**/${other}`, `**/${other}/**`],
    message: `The ${own} ${what} must not import the ${other} one. Talk through an event on the shared EventBus instead (master plan §8).`,
  }));

const FRAMEWORK_PATHS = [
  { name: 'express', message: 'Domain and application code must not depend on Express.' },
  {
    name: 'mongoose',
    message: 'Domain and application code must not depend on Mongoose; use a repository port.',
  },
];
const INNER_LAYER = {
  group: ['**/infrastructure/**', '**/api/**'],
  message: 'Inner layers (domain, application) must not import outer layers (infrastructure, api).',
};
const NO_USE_CASES = {
  group: ['**/modules/**'],
  message: 'Shared code must not depend on a use-case module.',
};
const PURE_CONTRACTS = {
  group: [
    'node:*',
    'express',
    'mongoose',
    'jsonwebtoken',
    'pino',
    '**/auth/**',
    '**/errors/**',
    '**/http/**',
    '**/modules/**',
  ],
  message:
    'Contracts are compiled into the web app too: keep them pure TypeScript with no Node, framework or module imports.',
};

const restrict = (options) => ({ 'no-restricted-imports': ['error', options] });

const DETERMINISM = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Inject an IdGenerator; domain code must be deterministic.',
    },
    {
      object: 'Date',
      property: 'now',
      message: 'Inject a Clock; domain code must be deterministic.',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Inject a Clock instead of calling new Date().',
    },
    {
      selector: "CallExpression[callee.name='uuid']",
      message: 'Inject an IdGenerator instead of generating ids inline.',
    },
  ],
};

const unusedVars = [
  'error',
  { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.stryker-tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'frontend/public/**',
      'mobile/android/**',
      'mobile/ios/**',
      'mobile/.expo/**',
      'mobile/dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': unusedVars,
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      complexity: ['error', 8],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 5],
    },
  },

  // ---- Backend: shared code ------------------------------------------------------------------
  { files: ['backend/**/*.ts'], languageOptions: { globals: globals.node } },
  {
    // General shared code: never reach into a use case.
    files: ['backend/src/shared/**/*.ts'],
    rules: restrict({ patterns: [NO_USE_CASES] }),
  },
  {
    // Shared inner layers: also no frameworks, no outer layers, and deterministic.
    files: ['backend/src/shared/*/domain/**/*.ts', 'backend/src/shared/*/application/**/*.ts'],
    rules: {
      ...restrict({ paths: FRAMEWORK_PATHS, patterns: [INNER_LAYER, NO_USE_CASES] }),
      ...DETERMINISM,
    },
  },
  {
    // The contracts folder is also compiled into the browser.
    files: ['backend/src/shared/contracts/**/*.ts', 'backend/src/shared/geo/GeoPoint.ts'],
    rules: restrict({ patterns: [PURE_CONTRACTS] }),
  },

  // ---- Backend: use-case modules ---------------------------------------------------------------
  ...USE_CASES.flatMap((own) => [
    {
      // Any layer of this module: never reach into another use case.
      files: [`backend/src/modules/${own}/**/*.ts`],
      rules: restrict({ patterns: crossUseCase(own, 'module') }),
    },
    {
      // Inner layers: also no frameworks, no outer layers, and deterministic.
      files: [
        `backend/src/modules/${own}/domain/**/*.ts`,
        `backend/src/modules/${own}/application/**/*.ts`,
      ],
      rules: {
        ...restrict({
          paths: FRAMEWORK_PATHS,
          patterns: [INNER_LAYER, ...crossUseCase(own, 'module')],
        }),
        ...DETERMINISM,
      },
    },
  ]),

  // ---- Frontend --------------------------------------------------------------------------------
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // A component that returns a whole screen is longer than a backend function; keep it honest, not tiny.
      'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true }],
    },
  },
  ...USE_CASES.map((own) => ({
    // A feature may only import its own folder and shared/.
    files: [`frontend/src/features/${own}/**/*.{ts,tsx}`],
    rules: restrict({ patterns: crossUseCase(own, 'feature') }),
  })),

  // ---- Mobile (Expo) ---------------------------------------------------------------------------
  {
    files: ['mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // As on the web: a component that returns a whole screen is longer than a backend function.
      'max-lines-per-function': ['error', { max: 90, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // The offline and API core stays free of React and Expo so Jest can test it without native mocks.
    files: [
      'mobile/src/features/*/domain/**/*.ts',
      'mobile/src/features/*/offline/**/*.ts',
      'mobile/src/features/*/api/**/*.ts',
    ],
    rules: {
      ...restrict({
        patterns: [
          {
            group: [
              'react',
              'react-native',
              'react-native-*',
              'expo',
              'expo-*',
              '@react-native-*/*',
              '**/adapters/**',
              '**/screens/**',
            ],
            message:
              'The offline core must not import React, React Native, Expo or adapters. Depend on a port instead.',
          },
        ],
      }),
      ...DETERMINISM,
    },
  },

  // ---- Tests, scripts, config files ----------------------------------------------------------------
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/testing/**', '**/test-utils/**', 'e2e/**'],
    rules: {
      'max-lines-per-function': 'off',
      'max-params': 'off',
      complexity: 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    files: [
      '**/*.config.{js,mjs,ts}',
      'scripts/**',
      'backend/src/seed/**',
      'backend/src/**/seed/**',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'max-lines-per-function': 'off',
      complexity: 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
