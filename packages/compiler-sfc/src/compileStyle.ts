/*
 * Vue单文件组件样式编译模块
 * 负责处理SFC中的<style>部分，包括预处理器处理、CSS作用域、CSS变量等
 */
import postcss, {
  type LazyResult,
  type Message,
  type ProcessOptions,
  type Result,
  type SourceMap,
} from 'postcss'
import trimPlugin from './style/pluginTrim'
import scopedPlugin from './style/pluginScoped'
import {
  type PreprocessLang,
  type StylePreprocessor,
  type StylePreprocessorResults,
  processors,
} from './style/preprocessors'
import type { RawSourceMap } from '@vue/compiler-core'
import { cssVarsPlugin } from './style/cssVars'
import postcssModules from 'postcss-modules'

/**
 * 单文件组件样式编译选项
 */
export interface SFCStyleCompileOptions {
  source: string
  filename: string
  id: string
  scoped?: boolean
  trim?: boolean
  isProd?: boolean
  inMap?: RawSourceMap
  preprocessLang?: PreprocessLang
  preprocessOptions?: any
  preprocessCustomRequire?: (id: string) => any
  postcssOptions?: any
  postcssPlugins?: any[]
  /**
   * @deprecated use `inMap` instead.
   */
  map?: RawSourceMap
}

/**
 * Aligns with postcss-modules
 * https://github.com/css-modules/postcss-modules
 */
/**
 * CSS模块选项
 * 与postcss-modules兼容
 * @see https://github.com/css-modules/postcss-modules
 */
export interface CSSModulesOptions {
  scopeBehaviour?: 'global' | 'local'
  generateScopedName?:
    | string
    | ((name: string, filename: string, css: string) => string)
  hashPrefix?: string
  localsConvention?: 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly'
  exportGlobals?: boolean
  globalModulePaths?: RegExp[]
}

/**
 * 异步样式编译选项
 * 扩展自SFCStyleCompileOptions
 */
export interface SFCAsyncStyleCompileOptions extends SFCStyleCompileOptions {
  isAsync?: boolean
  // css modules support, note this requires async so that we can get the
  // resulting json
  modules?: boolean
  modulesOptions?: CSSModulesOptions
}

/**
 * 样式编译结果
 */
export interface SFCStyleCompileResults {
  code: string
  map: RawSourceMap | undefined
  rawResult: Result | LazyResult | undefined
  errors: Error[]
  modules?: Record<string, string>
  dependencies: Set<string>
}

/**
 * 编译单文件组件样式
 * @param options 编译选项
 * @returns 编译结果
 */
export function compileStyle(
  options: SFCStyleCompileOptions,
): SFCStyleCompileResults {
  return doCompileStyle({
    ...options,
    isAsync: false,
  }) as SFCStyleCompileResults
}

/**
 * 异步编译单文件组件样式
 * @param options 编译选项
 * @returns 编译结果Promise
 */
export function compileStyleAsync(
  options: SFCAsyncStyleCompileOptions,
): Promise<SFCStyleCompileResults> {
  return doCompileStyle({
    ...options,
    isAsync: true,
  }) as Promise<SFCStyleCompileResults>
}

/**
 * 执行样式编译的内部函数
 * 同时支持同步和异步编译
 * @param options 编译选项
 * @returns 编译结果或Promise
 */
export function doCompileStyle(
  options: SFCAsyncStyleCompileOptions,
): SFCStyleCompileResults | Promise<SFCStyleCompileResults> {
  const {
    filename,
    id,
    scoped = false,
    trim = true,
    isProd = false,
    modules = false,
    modulesOptions = {},
    preprocessLang,
    postcssOptions,
    postcssPlugins,
  } = options
  // 获取对应的预处理器
  const preprocessor = preprocessLang && processors[preprocessLang]
  // 执行预编译
  const preProcessedSource = preprocessor && preprocess(options, preprocessor)
  const map = preProcessedSource
    ? preProcessedSource.map
    : options.inMap || options.map
  const source = preProcessedSource ? preProcessedSource.code : options.source

  // 提取短ID（移除data-v-前缀）
  const shortId = id.replace(/^data-v-/, '')
  // 生成完整ID
  const longId = `data-v-${shortId}`

  // 初始化postcss插件列表
  const plugins = (postcssPlugins || []).slice()
  // 添加CSS变量插件
  plugins.unshift(cssVarsPlugin({ id: shortId, isProd }))
  // 添加修剪插件（去除多余空白）
  if (trim) {
    plugins.push(trimPlugin())
  }
  // 添加作用域插件
  if (scoped) {
    plugins.push(scopedPlugin(longId))
  }
  // CSS模块结果存储
  let cssModules: Record<string, string> | undefined
  // 处理CSS模块
  if (modules) {
    if (__GLOBAL__ || __ESM_BROWSER__) {
      throw new Error(
        '[@vue/compiler-sfc] `modules` option is not supported in the browser build.',
      )
    }
    if (!options.isAsync) {
      throw new Error(
        '[@vue/compiler-sfc] `modules` option can only be used with compileStyleAsync().',
      )
    }
    plugins.push(
      postcssModules({
        ...modulesOptions,
        getJSON: (_cssFileName: string, json: Record<string, string>) => {
          cssModules = json
        },
      }),
    )
  }

  // 配置postcss选项
  const postCSSOptions: ProcessOptions = {
    ...postcssOptions,
    to: filename,
    from: filename,
  }
  if (map) {
    postCSSOptions.map = {
      inline: false,
      annotation: false,
      prev: map,
    }
  }

  // 编译结果
  let result: LazyResult | undefined
  let code: string | undefined
  let outMap: SourceMap | undefined
  // stylus输出包含普通CSS，需要移除重复项
  const dependencies = new Set(
    preProcessedSource ? preProcessedSource.dependencies : [],
  )
  // sass has filename self when provided filename option
  dependencies.delete(filename)

  const errors: Error[] = []
  if (preProcessedSource && preProcessedSource.errors.length) {
    errors.push(...preProcessedSource.errors)
  }

  // 记录普通CSS依赖
  const recordPlainCssDependencies = (messages: Message[]) => {
    messages.forEach(msg => {
      if (msg.type === 'dependency') {
        // postcss output path is absolute position path
        dependencies.add(msg.file)
      }
    })
    return dependencies
  }

  // 尝试编译
  try {
    result = postcss(plugins).process(source, postCSSOptions)

    // 异步模式下，返回Promise
    if (options.isAsync) {
      // 处理异步编译结果
      return result
        .then(result => ({
          // 编译后的CSS代码
          code: result.css || '',
          // 源码映射
          map: result.map && result.map.toJSON(),
          // 错误列表
          errors,
          // CSS模块映射
          modules: cssModules,
          // 原始postcss结果
          rawResult: result,
          // 依赖列表
          dependencies: recordPlainCssDependencies(result.messages),
        }))
        .catch(error => ({
          // 处理编译错误
          code: '',
          map: undefined,
          errors: [...errors, error],
          rawResult: undefined,
          dependencies,
        }))
    }

    recordPlainCssDependencies(result.messages)
    // force synchronous transform (we know we only have sync plugins)
    code = result.css
    outMap = result.map
  // 捕获同步编译错误
  } catch (e: any) {
    // 添加错误到错误列表
    errors.push(e)
  }

  // 返回同步编译结果
  return {
    code: code || ``,
    map: outMap && outMap.toJSON(),
    errors,
    rawResult: result,
    dependencies,
  }
}

/**
 * 预处理器执行函数
 * @param options 编译选项
 * @param preprocessor 预处理器函数
 * @returns 预处理结果
 */
function preprocess(
  options: SFCStyleCompileOptions,
  preprocessor: StylePreprocessor,
): StylePreprocessorResults {
  // 浏览器环境下需要提供预处理器加载函数
  if ((__ESM_BROWSER__ || __GLOBAL__) && !options.preprocessCustomRequire) {
    throw new Error(
      `[@vue/compiler-sfc] Style preprocessing in the browser build must ` +
        `provide the \`preprocessCustomRequire\` option to return the in-browser ` +
        `version of the preprocessor.`,
    )
  }

  return preprocessor(
    options.source,
    options.inMap || options.map,
    {
      filename: options.filename,
      ...options.preprocessOptions,
    },
    options.preprocessCustomRequire,
  )
}
