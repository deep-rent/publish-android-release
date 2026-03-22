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
    sourcemap: false,
  },
  treeshake: {
    moduleSideEffects: 'no-external',
    propertyReadSideEffects: false,
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nodeResolve as any)({ preferBuiltins: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (commonjs as any)(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (json as any)(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (typescript as any)({
      compilerOptions: {
        moduleResolution: 'bundler',
        module: 'ESNext',
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (terser as any)({
      maxWorkers: 4,
      compress: {
        passes: 2,
        drop_console: false,
      },
    }),
  ],
  onwarn: (warning, warn) => {
    if (
      warning.code === 'THIS_IS_UNDEFINED' ||
      warning.code === 'CIRCULAR_DEPENDENCY'
    ) {
      return
    }
    warn(warning)
  },
}

export default config
