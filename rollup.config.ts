/**
 * Copyright (c) 2026 deep.rent GmbH (https://deep.rent)
 * Licensed under the MIT License.
 */

import { defineConfig } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    generatedCode: {
      constBindings: true,
      arrowFunctions: true,
      objectShorthand: true,
    },
    inlineDynamicImports: true,
    sourcemap: false,
  },
  treeshake: {
    moduleSideEffects: 'no-external',
    propertyReadSideEffects: false,
  },
  plugins: [
    (nodeResolve as any)({ preferBuiltins: true }),
    (commonjs as any)(),
    (json as any)(),
    (typescript as any)({
      compilerOptions: {
        moduleResolution: 'bundler',
        module: 'ESNext',
      },
    }),
    (terser as any)({
      ecma: 2023,
      maxWorkers: 2,
      format: {
        comments: false,
      },
      compress: {
        passes: 2,
        drop_console: false,
      },
    }),
  ],
  onwarn: (warning: any, warn: any) => {
    if (
      warning.code === 'THIS_IS_UNDEFINED' ||
      warning.code === 'CIRCULAR_DEPENDENCY'
    ) {
      return
    }
    warn(warning)
  },
})
