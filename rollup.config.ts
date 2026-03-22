import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript(),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onwarn: (warning: any, warn: any) => {
    if (warning.code === 'THIS_IS_UNDEFINED') {
      return
    }
    warn(warning)
  },
}

export default config
