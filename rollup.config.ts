import type { RollupOptions } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

const config: RollupOptions = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    inlineDynamicImports: true,
    sourcemap: true,
  },
  treeshake: {
    moduleSideEffects: 'no-external',
    propertyReadSideEffects: false,
  },
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript({
      compilerOptions: {
        moduleResolution: 'bundler',
        module: 'ESNext',
      },
    }),
    terser({
      maxWorkers: 4,
      compress: {
        passes: 2,
        drop_console: false,
      },
    }),
  ],
}

export default config
