/**
 * Vue DOM编译器的入口文件
 * 提供针对浏览器环境的模板编译功能
 * @packageDocumentation
 */
// 从compiler-core导入核心编译类型和基础功能
import {
  type CodegenResult,
  type CompilerOptions,
  type DirectiveTransform,
  type NodeTransform,
  type ParserOptions,
  type RootNode,
  baseCompile,
  baseParse,
  noopDirectiveTransform,
} from '@vue/compiler-core'
// 导入DOM解析器选项
import { parserOptions } from './parserOptions'
// 导入DOM特定转换函数
import { transformStyle } from './transforms/transformStyle'
import { transformVHtml } from './transforms/vHtml'
import { transformVText } from './transforms/vText'
import { transformModel } from './transforms/vModel'
import { transformOn } from './transforms/vOn'
import { transformShow } from './transforms/vShow'
import { transformTransition } from './transforms/Transition'
import { stringifyStatic } from './transforms/stringifyStatic'
import { ignoreSideEffectTags } from './transforms/ignoreSideEffectTags'
import { validateHtmlNesting } from './transforms/validateHtmlNesting'
// 导入共享工具函数
import { extend } from '@vue/shared'

/**
 * DOM解析器选项
 * 包含针对HTML的解析配置
 */
export { parserOptions }

/**
 * DOM节点转换数组
 * 包含针对DOM元素的特定转换处理
 */
export const DOMNodeTransforms: NodeTransform[] = [
  transformStyle,
  ...(__DEV__ ? [transformTransition, validateHtmlNesting] : []),
]

/**
 * DOM指令转换映射
 * 包含DOM特定指令的转换处理函数
 */
export const DOMDirectiveTransforms: Record<string, DirectiveTransform> = {
  cloak: noopDirectiveTransform,
  html: transformVHtml,
  text: transformVText,
  model: transformModel, // override compiler-core
  on: transformOn, // override compiler-core
  show: transformShow,
}

/**
 * 编译DOM模板为渲染函数
 * @param src - 模板字符串或已解析的根节点
 * @param options - 编译选项
 * @returns 代码生成结果
 */
export function compile(
  src: string | RootNode,
  options: CompilerOptions = {},
): CodegenResult {
  return baseCompile(
    src,
    // 合并解析器选项、用户选项和DOM特定选项
    extend({}, parserOptions, options, {
      nodeTransforms: [
        // 忽略<script>和<tag>标签
        // 这个转换不在DOMNodeTransforms中，因为该列表被compiler-ssr用于生成vnode备选分支
        ignoreSideEffectTags,
        // 添加DOM特定节点转换
        ...DOMNodeTransforms,
        // 添加用户自定义节点转换
        ...(options.nodeTransforms || []),
      ],
      directiveTransforms: extend(
        {},
        // DOM特定指令转换
        DOMDirectiveTransforms,
        // 用户自定义指令转换
        options.directiveTransforms || {},
      ),
      // 静态节点提升转换
        // 浏览器环境下禁用，服务端环境下使用stringifyStatic
        transformHoist: __BROWSER__ ? null : stringifyStatic,
    }),
  )
}

/**
 * 解析DOM模板为抽象语法树
 * @param template - 模板字符串
 * @param options - 解析选项
 * @returns 解析后的根节点
 */
export function parse(template: string, options: ParserOptions = {}): RootNode {
  return baseParse(template, extend({}, parserOptions, options))
}

// 导出运行时辅助函数
export * from './runtimeHelpers'
// 导出样式转换函数
export { transformStyle } from './transforms/transformStyle'
// 导出DOM编译错误相关功能
export {
  createDOMCompilerError,
  DOMErrorCodes,
  DOMErrorMessages,
} from './errors'
// 重新导出compiler-core的所有API
export * from '@vue/compiler-core'
