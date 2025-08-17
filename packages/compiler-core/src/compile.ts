/**
 * Vue 编译器核心模块
 * 包含模板编译的主要逻辑，包括解析、转换和代码生成
 */
import type { CompilerOptions } from './options'
import { baseParse } from './parser'
import {
  type DirectiveTransform,
  type NodeTransform,
  transform,
} from './transform'
import { type CodegenResult, generate } from './codegen'
import type { RootNode } from './ast'
import { extend, isString } from '@vue/shared'
import { transformIf } from './transforms/vIf'
import { transformFor } from './transforms/vFor'
import { transformExpression } from './transforms/transformExpression'
import { transformSlotOutlet } from './transforms/transformSlotOutlet'
import { transformElement } from './transforms/transformElement'
import { transformOn } from './transforms/vOn'
import { transformBind } from './transforms/vBind'
import { trackSlotScopes, trackVForSlotScopes } from './transforms/vSlot'
import { transformText } from './transforms/transformText'
import { transformOnce } from './transforms/vOnce'
import { transformModel } from './transforms/vModel'
import { transformFilter } from './compat/transformFilter'
import { ErrorCodes, createCompilerError, defaultOnError } from './errors'
import { transformMemo } from './transforms/vMemo'

/**
 * 转换预设类型
 * @typedef {Array} TransformPreset
 * @property {NodeTransform[]} 0 - 节点转换函数数组
 * @property {Record<string, DirectiveTransform>} 1 - 指令转换函数映射
 */
export type TransformPreset = [
  NodeTransform[],
  Record<string, DirectiveTransform>,
]

/**
 * 获取基础转换预设
 * @param {boolean} [prefixIdentifiers] - 是否为标识符添加前缀
 * @returns {TransformPreset} 转换预设数组
 */
export function getBaseTransformPreset(
  prefixIdentifiers?: boolean,
): TransformPreset {
  return [
    [
      transformOnce,       // 处理 v-once 指令
      transformIf,         // 处理 v-if 指令
      transformMemo,       // 处理 v-memo 指令
      transformFor,        // 处理 v-for 指令
      ...(__COMPAT__ ? [transformFilter] : []),  // 兼容模式下添加过滤器转换
      ...(!__BROWSER__ && prefixIdentifiers
        ? [
            // order is important
            trackVForSlotScopes,  // 跟踪 v-for 中的插槽作用域
            transformExpression,  // 转换表达式
          ]
        : __BROWSER__ && __DEV__
          ? [transformExpression]  // 浏览器开发模式下转换表达式
          : []),
      transformSlotOutlet,  // 转换插槽出口
      transformElement,     // 转换元素
      trackSlotScopes,      // 跟踪插槽作用域
      transformText,        // 转换文本
    ],
    {
      on: transformOn,      // 处理 @ 或 v-on 指令
      bind: transformBind,  // 处理 : 或 v-bind 指令
      model: transformModel, // 处理 v-model 指令
    },
  ]
}

/**
 * 基础编译函数
 * 将模板字符串或AST节点编译为JavaScript代码
 * @param {string | RootNode} source - 模板字符串或AST根节点
 * @param {CompilerOptions} [options={}] - 编译选项
 * @returns {CodegenResult} 代码生成结果
 */
// 命名为 `baseCompile` 以便更高阶的编译器如 @vue/compiler-dom
// 可以导出 `compile` 同时重新导出其他所有内容

export function baseCompile(
  source: string | RootNode,
  options: CompilerOptions = {},
): CodegenResult {
  const onError = options.onError || defaultOnError
  const isModuleMode = options.mode === 'module'

  /* v8 ignore start */
  // 浏览器环境下的错误检查
  if (__BROWSER__) {
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (isModuleMode) {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }
  /* v8 ignore stop */

  // 确定是否需要为标识符添加前缀
  const prefixIdentifiers = !__BROWSER__ && (options.prefixIdentifiers === true || isModuleMode)

  // 检查不支持的选项组合
  if (!prefixIdentifiers && options.cacheHandlers) {
    onError(createCompilerError(ErrorCodes.X_CACHE_HANDLER_NOT_SUPPORTED))
  }
  if (options.scopeId && !isModuleMode) {
    onError(createCompilerError(ErrorCodes.X_SCOPE_ID_NOT_SUPPORTED))
  }

  // 解析并合并选项
  const resolvedOptions = extend({}, options, {
    prefixIdentifiers,
  })

  // 解析模板得到AST
  const ast = isString(source) ? baseParse(source, resolvedOptions) : source

  // 获取转换预设
  const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(prefixIdentifiers)

  // 处理TypeScript表达式
  if (!__BROWSER__ && options.isTS) {
    const { expressionPlugins } = options
    if (!expressionPlugins || !expressionPlugins.includes('typescript')) {
      options.expressionPlugins = [...(expressionPlugins || []), 'typescript']
    }
  }

  // 转换AST
  transform(
    ast,
    extend({}, resolvedOptions, {
      nodeTransforms: [
        ...nodeTransforms,             // 基础转换
        ...(options.nodeTransforms || []), // 用户自定义转换
      ],
      directiveTransforms: extend(
        {},
        directiveTransforms,           // 基础指令转换
        options.directiveTransforms || {}, // 用户自定义指令转换
      ),
    }),
  )

  // 生成JavaScript代码
  return generate(ast, resolvedOptions)
}
