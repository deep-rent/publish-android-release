/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jest from 'eslint-plugin-jest'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import licenseHeader from 'eslint-plugin-license-header'

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jest.configs['flat/recommended'],
  prettierRecommended,

  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    plugins: {
      'license-header': licenseHeader,
    },
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
      'license-header/header': [
        'error',
        [
          '/**',
          ' * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)',
          ' * Licensed under the MIT License.',
          ' */',
        ],
      ],
      'no-console': 'off',
      'no-shadow': 'off',
      'no-unused-vars': 'off',
      'prettier/prettier': 'error',
    },
  },
)
