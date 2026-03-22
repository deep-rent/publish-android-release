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
    // @ts-expect-error - Plugin types are not callable in NodeNext.
    nodeResolve({ preferBuiltins: true }),
    // @ts-expect-error - Plugin types are not callable in NodeNext.
    commonjs(),
    // @ts-expect-error - Plugin types are not callable in NodeNext.
    json(),
    // @ts-expect-error - Plugin types are not callable in NodeNext.
    typescript({
      compilerOptions: {
        moduleResolution: 'bundler',
        module: 'ESNext',
      },
    }),
    // @ts-expect-error - Plugin types are not callable in NodeNext.
    terser({
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
