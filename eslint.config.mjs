// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jest from 'eslint-plugin-jest'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

export default tseslint.config(
  // 1. Global Ignores
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },

  // 2. Base Configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jest.configs['flat/recommended'],
  prettierRecommended,

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '__fixtures__/*.ts',
            '__tests__/*.ts',
            'eslint.config.mjs',
            'jest.config.ts',
            'prettier.config.mjs',
            'rollup.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      'camelcase': 'off',
      'eslint-comments/no-unused-disable': 'off',
      'eslint-comments/no-use': 'off',
      'i18n-text/no-en': 'off',
      'import/no-namespace': 'off',
      'no-console': 'off',
      'no-shadow': 'off',
      'no-unused-vars': 'off',
      'prettier/prettier': 'error',
    },
  },
)
