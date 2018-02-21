import pkg from './package.json'
import {minify} from 'uglify-es'
import rpi_uglify from 'rollup-plugin-uglify'
import rpi_jsy from 'rollup-plugin-jsy-babel'

const sourcemap = 'inline'

const external = []

const plugins = [rpi_jsy()]
const ugly = { compress: {warnings: false}, output: {comments: false}, sourceMap: false }
const prod_plugins = plugins.concat([rpi_uglify(ugly, minify)])

export default [
	{ input: 'code/index.node.js',
		output: { file: pkg.main, format: 'cjs', sourcemap, exports:'named' },
    external, plugins },

	{ input: 'code/index.js',
		output: [
      { file: pkg.module, format: 'es', sourcemap },
      { file: 'umd/revitalize-object-all.js', format: 'umd', sourcemap, name: 'revitalizae-object', exports:'named' },
    ],
    external, plugins },

  prod_plugins &&
    { input: 'code/index.js',
      output: { file: pkg.browser, format: 'umd', name: 'revitalizae-object', exports:'named' },
      external, plugins: prod_plugins },

].filter(e=>e)
