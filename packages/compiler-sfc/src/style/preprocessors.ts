/**
 * Vue单文件组件样式预处理器模块
 * 该模块提供了处理不同类型样式预处理器的功能，包括scss、sass、less和stylus
 */
import merge from 'merge-source-map'
import type { RawSourceMap } from '@vue/compiler-core'
import type { SFCStyleCompileOptions } from '../compileStyle'
import { isFunction } from '@vue/shared'

/**
 * 样式预处理器函数类型
 * @param {string} source - 源代码
 * @param {RawSourceMap | undefined} map - 源映射
 * @param {Object} options - 预处理器选项
 * @param {Function} customRequire - 自定义require函数
 * @returns {StylePreprocessorResults} 预处理器结果
 */
export type StylePreprocessor = (
  source: string,
  map: RawSourceMap | undefined,
  options: {
    [key: string]: any
    additionalData?: string | ((source: string, filename: string) => string)
    filename: string
  },
  customRequire: SFCStyleCompileOptions['preprocessCustomRequire'],
) => StylePreprocessorResults

/**
 * 样式预处理器结果接口
 * @property {string} code - 处理后的CSS代码
 * @property {Object} [map] - 源映射
 * @property {Error[]} errors - 错误数组
 * @property {string[]} dependencies - 依赖文件列表
 */
export interface StylePreprocessorResults {
  code: string
  map?: object
  errors: Error[]
  dependencies: string[]
}

/**
 * SCSS/SASS样式预处理器
 * @param {string} source - SCSS/SASS源代码
 * @param {RawSourceMap | undefined} map - 源映射
 * @param {Object} options - 预处理器选项
 * @param {Function} load - 加载函数，默认为require
 * @returns {StylePreprocessorResults} 预处理器结果
 */
// .scss/.sass processor
const scss: StylePreprocessor = (source, map, options, load = require) => {
  const nodeSass: typeof import('sass') = load('sass')
  const { compileString, renderSync } = nodeSass

  const data = getSource(source, options.filename, options.additionalData)
  let css: string
  let dependencies: string[]
  let sourceMap: any

  try {
    if (compileString) {
      const { pathToFileURL, fileURLToPath }: typeof import('url') = load('url')

      const result = compileString(data, {
        ...options,
        url: pathToFileURL(options.filename),
        sourceMap: !!map,
      })
      css = result.css
      dependencies = result.loadedUrls.map(url => fileURLToPath(url))
      sourceMap = map ? result.sourceMap! : undefined
    } else {
      const result = renderSync({
        ...options,
        data,
        file: options.filename,
        outFile: options.filename,
        sourceMap: !!map,
      })
      css = result.css.toString()
      dependencies = result.stats.includedFiles
      sourceMap = map ? JSON.parse(result.map!.toString()) : undefined
    }

    if (map) {
      return {
        code: css,
        errors: [],
        dependencies,
        map: merge(map, sourceMap!),
      }
    }
    return { code: css, errors: [], dependencies }
  } catch (e: any) {
    return { code: '', errors: [e], dependencies: [] }
  }
}

/**
 * SASS样式预处理器（使用缩进语法）
 * @param {string} source - SASS源代码
 * @param {RawSourceMap | undefined} map - 源映射
 * @param {Object} options - 预处理器选项
 * @param {Function} load - 加载函数
 * @returns {StylePreprocessorResults} 预处理器结果
 */
const sass: StylePreprocessor = (source, map, options, load) =>
  scss(
    source,
    map,
    {
      ...options,
      indentedSyntax: true,
    },
    load,
  )

/**
 * LESS样式预处理器
 * @param {string} source - LESS源代码
 * @param {RawSourceMap | undefined} map - 源映射
 * @param {Object} options - 预处理器选项
 * @param {Function} load - 加载函数，默认为require
 * @returns {StylePreprocessorResults} 预处理器结果
 */
// .less
const less: StylePreprocessor = (source, map, options, load = require) => {
  const nodeLess = load('less')

  let result: any
  let error: Error | null = null
  nodeLess.render(
    getSource(source, options.filename, options.additionalData),
    { ...options, syncImport: true },
    (err: Error | null, output: any) => {
      error = err
      result = output
    },
  )

  if (error) return { code: '', errors: [error], dependencies: [] }
  const dependencies = result.imports
  if (map) {
    return {
      code: result.css.toString(),
      map: merge(map, result.map),
      errors: [],
      dependencies: dependencies,
    }
  }

  return {
    code: result.css.toString(),
    errors: [],
    dependencies: dependencies,
  }
}

/**
 * Stylus样式预处理器
 * @param {string} source - Stylus源代码
 * @param {RawSourceMap | undefined} map - 源映射
 * @param {Object} options - 预处理器选项
 * @param {Function} load - 加载函数，默认为require
 * @returns {StylePreprocessorResults} 预处理器结果
 */
// .styl
const styl: StylePreprocessor = (source, map, options, load = require) => {
  const nodeStylus = load('stylus')
  try {
    const ref = nodeStylus(source, options)
    if (map) ref.set('sourcemap', { inline: false, comment: false })

    const result = ref.render()
    const dependencies = ref.deps()
    if (map) {
      return {
        code: result,
        map: merge(map, ref.sourcemap),
        errors: [],
        dependencies,
      }
    }

    return { code: result, errors: [], dependencies }
  } catch (e: any) {
    return { code: '', errors: [e], dependencies: [] }
  }
}

/**
 * 获取处理后的源代码
 * @param {string} source - 原始源代码
 * @param {string} filename - 文件名
 * @param {string | Function} [additionalData] - 额外数据，可以是字符串或函数
 * @returns {string} 处理后的源代码
 */
function getSource(
  source: string,
  filename: string,
  additionalData?: string | ((source: string, filename: string) => string),
) {
  if (!additionalData) return source
  if (isFunction(additionalData)) {
    return additionalData(source, filename)
  }
  return additionalData + source
}

/**
 * 支持的预处理器语言类型
 */
export type PreprocessLang = 'less' | 'sass' | 'scss' | 'styl' | 'stylus'

/**
 * 预处理器映射对象
 * 将语言名称映射到对应的预处理器函数
 */
export const processors: Record<PreprocessLang, StylePreprocessor> = {
  less,
  sass,
  scss,
  styl,
  stylus: styl,
}
