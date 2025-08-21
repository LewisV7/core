/*
 * Vue单文件组件模板编译模块
 * 负责处理SFC中的<template>部分，包括模板预处理、转换和代码生成
 */
import {
  type CodegenResult,
  type CompilerError,
  type CompilerOptions,
  type ElementNode,
  type NodeTransform,
  NodeTypes,
  type ParserOptions,
  type RawSourceMap,
  type RootNode,
  createRoot,
} from '@vue/compiler-core'
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js'
import {
  type AssetURLOptions,
  type AssetURLTagConfig,
  createAssetUrlTransformWithOptions,
  normalizeOptions,
  transformAssetUrl,
} from './template/transformAssetUrl'
import {
  createSrcsetTransformWithOptions,
  transformSrcset,
} from './template/transformSrcset'
import { generateCodeFrame, isObject } from '@vue/shared'
import * as CompilerDOM from '@vue/compiler-dom'
import * as CompilerSSR from '@vue/compiler-ssr'
import consolidate from '@vue/consolidate'
import { warnOnce } from './warn'
import { genCssVarsFromList } from './style/cssVars'

/**
 * 模板编译器接口
 * 定义编译和解析模板的方法
 */
export interface TemplateCompiler {
  compile(source: string | RootNode, options: CompilerOptions): CodegenResult
  parse(template: string, options: ParserOptions): RootNode
}

/**
 * 单文件组件模板编译结果
 */
export interface SFCTemplateCompileResults {
  code: string
  ast?: RootNode
  preamble?: string
  source: string
  tips: string[]
  errors: (string | CompilerError)[]
  map?: RawSourceMap
}

/**
 * 单文件组件模板编译选项
 */
export interface SFCTemplateCompileOptions {
  source: string
  ast?: RootNode
  filename: string
  id: string
  scoped?: boolean
  slotted?: boolean
  isProd?: boolean
  ssr?: boolean
  ssrCssVars?: string[]
  inMap?: RawSourceMap
  compiler?: TemplateCompiler
  compilerOptions?: CompilerOptions
  preprocessLang?: string
  preprocessOptions?: any
  /**
   * In some cases, compiler-sfc may not be inside the project root (e.g. when
   * linked or globally installed). In such cases a custom `require` can be
   * passed to correctly resolve the preprocessors.
   */
  preprocessCustomRequire?: (id: string) => any
  /**
   * Configure what tags/attributes to transform into asset url imports,
   * or disable the transform altogether with `false`.
   */
  transformAssetUrls?: AssetURLOptions | AssetURLTagConfig | boolean
}

/**
 * 预处理器接口
 */
interface PreProcessor {
  render(
    source: string,
    options: any,
    cb: (err: Error | null, res: string) => void,
  ): void
}

/**
 * 模板预处理器执行函数
 * @param options 编译选项
 * @param preprocessor 预处理器实例
 * @returns 预处理后的模板字符串
 */
function preprocess(
  { source, filename, preprocessOptions }: SFCTemplateCompileOptions,
  preprocessor: PreProcessor,
): string {
  // Consolidate exposes a callback based API, but the callback is in fact
  // called synchronously for most templating engines. In our case, we have to
  // expose a synchronous API so that it is usable in Jest transforms (which
  // have to be sync because they are applied via Node.js require hooks)
  let res: string = ''
  let err: Error | null = null

  preprocessor.render(
    source,
    { filename, ...preprocessOptions },
    (_err, _res) => {
      // 浏览器环境下需要提供预处理器加载函数
  if (_err) err = _err
      res = _res
    },
  )

  if (err) throw err
  return res
}

/**
 * 编译单文件组件模板
 * @param options 编译选项
 * @returns 编译结果
 */
export function compileTemplate(
  options: SFCTemplateCompileOptions,
): SFCTemplateCompileResults {
  // 提取预处理器相关选项
  const { preprocessLang, preprocessCustomRequire } = options

  if (
    (__ESM_BROWSER__ || __GLOBAL__) &&
    preprocessLang &&
    !preprocessCustomRequire
  ) {
    throw new Error(
      `[@vue/compiler-sfc] Template preprocessing in the browser build must ` +
        `provide the \`preprocessCustomRequire\` option to return the in-browser ` +
        `version of the preprocessor in the shape of { render(): string }.`,
    )
  }

  // 获取预处理器实例
  const preprocessor = preprocessLang
    ? preprocessCustomRequire
      ? preprocessCustomRequire(preprocessLang)
      : __ESM_BROWSER__
        ? undefined
        : consolidate[preprocessLang as keyof typeof consolidate]
    : false
  // 如果存在预处理器，则先进行预处理
  if (preprocessor) {
    try {
      return doCompileTemplate({
        ...options,
        source: preprocess(options, preprocessor),
        ast: undefined, // invalidate AST if template goes through preprocessor
      })
    } catch (e: any) {
      return {
        code: `export default function render() {}`,
        source: options.source,
        tips: [],
        errors: [e],
      }
    }
  // 预处理器语言指定但未找到对应的预处理器
  } else if (preprocessLang) {
    return {
      code: `export default function render() {}`,
      source: options.source,
      tips: [
        `Component ${options.filename} uses lang ${preprocessLang} for template. Please install the language preprocessor.`,
      ],
      errors: [
        `Component ${options.filename} uses lang ${preprocessLang} for template, however it is not installed.`,
      ],
    }
  // 无预处理器，直接编译
  } else {
    return doCompileTemplate(options)
  }
}

/**
 * 执行模板编译的内部函数
 * @param options 编译选项
 * @returns 编译结果
 */
function doCompileTemplate({
  filename,
  id,
  scoped,
  slotted,
  inMap,
  source,
  ast: inAST,
  ssr = false,
  ssrCssVars,
  isProd = false,
  compiler,
  compilerOptions = {},
  transformAssetUrls,
}: SFCTemplateCompileOptions): SFCTemplateCompileResults {
  // 初始化错误和警告数组
  const errors: CompilerError[] = []
  const warnings: CompilerError[] = []

  // 初始化节点转换数组
  let nodeTransforms: NodeTransform[] = []
  // 配置资源URL转换（带选项）
  if (isObject(transformAssetUrls)) {
    const assetOptions = normalizeOptions(transformAssetUrls)
    nodeTransforms = [
      createAssetUrlTransformWithOptions(assetOptions),
      createSrcsetTransformWithOptions(assetOptions),
    ]
  // 配置资源URL转换（默认选项）
  } else if (transformAssetUrls !== false) {
    nodeTransforms = [transformAssetUrl, transformSrcset]
  }

  // SSR模式下如果没有提供CSS变量则发出警告
  if (ssr && !ssrCssVars) {
    warnOnce(
      `compileTemplate is called with \`ssr: true\` but no ` +
        `corresponding \`cssVars\` option.`,
    )
  }
  // 如果没有提供ID则发出警告
  if (!id) {
    warnOnce(`compileTemplate now requires the \`id\` option.`)
    id = ''
  }

  // 提取短ID（移除data-v-前缀）
  const shortId = id.replace(/^data-v-/, '')
  // 生成完整ID
  const longId = `data-v-${shortId}`

  // 根据SSR模式选择默认编译器
  const defaultCompiler = ssr ? (CompilerSSR as TemplateCompiler) : CompilerDOM
  // 使用用户提供的编译器或默认编译器
  compiler = compiler || defaultCompiler

  // 如果使用自定义编译器，则不能复用已有AST
  if (compiler !== defaultCompiler) {
    // user using custom compiler, this means we cannot reuse the AST from
    // the descriptor as they might be different.
    inAST = undefined
  }

  // 如果输入AST已被转换，则需要重新解析
  if (inAST?.transformed) {
    // If input AST has already been transformed, then it cannot be reused.
    // We need to parse a fresh one. Can't just use `source` here since we need
    // the AST location info to be relative to the entire SFC.
    // 解析新的AST
    const newAST = (ssr ? CompilerDOM : compiler).parse(inAST.source, {
      prefixIdentifiers: true,
      ...compilerOptions,
      parseMode: 'sfc',
      onError: e => errors.push(e),
    })
    // 查找template元素
    const template = newAST.children.find(
      node => node.type === NodeTypes.ELEMENT && node.tag === 'template',
    ) as ElementNode
    inAST = createRoot(template.children, inAST.source)
  }

  // 编译模板
  let { code, ast, preamble, map } = compiler.compile(inAST || source, {
    mode: 'module',
    prefixIdentifiers: true,
    hoistStatic: true,
    cacheHandlers: true,
    ssrCssVars:
      ssr && ssrCssVars && ssrCssVars.length
        ? genCssVarsFromList(ssrCssVars, shortId, isProd, true)
        : '',
    scopeId: scoped ? longId : undefined,
    slotted,
    sourceMap: true,
    ...compilerOptions,
    hmr: !isProd,
    nodeTransforms: nodeTransforms.concat(compilerOptions.nodeTransforms || []),
    filename,
    onError: e => errors.push(e),
    onWarn: w => warnings.push(w),
  })

  // inMap should be the map produced by ./parse.ts which is a simple line-only
  // mapping. If it is present, we need to adjust the final map and errors to
  // reflect the original line numbers.
  if (inMap && !inAST) {
    if (map) {
      map = mapLines(inMap, map)
    }
    if (errors.length) {
      patchErrors(errors, source, inMap)
    }
  }

  const tips = warnings.map(w => {
    let msg = w.message
    if (w.loc) {
      msg += `\n${generateCodeFrame(
        inAST?.source || source,
        w.loc.start.offset,
        w.loc.end.offset,
      )}`
    }
    return msg
  })

  return { code, ast, preamble, source, errors, tips, map }
}

function mapLines(oldMap: RawSourceMap, newMap: RawSourceMap): RawSourceMap {
  if (!oldMap) return newMap
  if (!newMap) return oldMap

  const oldMapConsumer = new SourceMapConsumer(oldMap)
  const newMapConsumer = new SourceMapConsumer(newMap)
  const mergedMapGenerator = new SourceMapGenerator()

  newMapConsumer.eachMapping(m => {
    if (m.originalLine == null) {
      return
    }

    const origPosInOldMap = oldMapConsumer.originalPositionFor({
      line: m.originalLine,
      column: m.originalColumn!,
    })

    if (origPosInOldMap.source == null) {
      return
    }

    mergedMapGenerator.addMapping({
      generated: {
        line: m.generatedLine,
        column: m.generatedColumn,
      },
      original: {
        line: origPosInOldMap.line, // map line
        // use current column, since the oldMap produced by @vue/compiler-sfc
        // does not
        column: m.originalColumn!,
      },
      source: origPosInOldMap.source,
      name: origPosInOldMap.name,
    })
  })

  // source-map's type definition is incomplete
  const generator = mergedMapGenerator as any
  ;(oldMapConsumer as any).sources.forEach((sourceFile: string) => {
    generator._sources.add(sourceFile)
    const sourceContent = oldMapConsumer.sourceContentFor(sourceFile)
    if (sourceContent != null) {
      mergedMapGenerator.setSourceContent(sourceFile, sourceContent)
    }
  })

  generator._sourceRoot = oldMap.sourceRoot
  generator._file = oldMap.file
  return generator.toJSON()
}

function patchErrors(
  errors: CompilerError[],
  source: string,
  inMap: RawSourceMap,
) {
  const originalSource = inMap.sourcesContent![0]
  const offset = originalSource.indexOf(source)
  const lineOffset = originalSource.slice(0, offset).split(/\r?\n/).length - 1
  errors.forEach(err => {
    if (err.loc) {
      err.loc.start.line += lineOffset
      err.loc.start.offset += offset
      if (err.loc.end !== err.loc.start) {
        err.loc.end.line += lineOffset
        err.loc.end.offset += offset
      }
    }
  })
}
