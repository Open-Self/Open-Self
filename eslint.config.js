import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: [
            'node_modules/',
            'coverage/',
            'data/',
            'src/web/index.html',
            'tests/.tmp/',
        ],
    },
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...(globals.vitest || {}) },
        },
        rules: {
            'no-unused-expressions': 'off',
            'no-unused-vars': 'warn',
        },
    },
];
