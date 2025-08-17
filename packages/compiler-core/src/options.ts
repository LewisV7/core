import type {
  ElementNode,
  Namespace,
  Namespaces,
  ParentNode,
  TemplateChildNode,
} from './ast'
import type { CompilerError } from './errors'
import type {
  DirectiveTransform,
  NodeTransform,
  TransformContext,
} from './transform'
import type { CompilerCompatOptions } from './compat/compatConfig'
import type { ParserPlugin } from '@babel/parser'

export interface ErrorHandlingOptions {
  onWarn?: (warning: CompilerError) => void
  onError?: (error: CompilerError) => void
}

export interface ParserOptions
  extends ErrorHandlingOptions,
    CompilerCompatOptions {
  /**
   * Base mode is platform agnostic and only parses HTML-like template syntax,
   * treating all tags the same way. Specific tag parsing behavior can be
   * configured by higher-level compilers.
   *
   * HTML mode adds additional logic for handling special parsing behavior in
   * `<script>`, `<style>`,`<title>` and `<textarea>`.
   * The logic is handled inside compiler-core for efficiency.
   *
   * SFC mode treats content of all root-level tags except `<template>` as plain
   * text.
   */
  parseMode?: 'base' | 'html' | 'sfc'
  /**
   * Specify the root namespace to use when parsing a template.
   * Defaults to `Namespaces.HTML` (0).
   */
  ns?: Namespaces
  /**
   * e.g. platform native elements, e.g. `<div>` for browsers
   */
  isNativeTag?: (tag: string) => boolean
  /**
   * e.g. native elements that can self-close, e.g. `<img>`, `<br>`, `<hr>`
   */
  isVoidTag?: (tag: string) => boolean
  /**
   * e.g. elements that should preserve whitespace inside, e.g. `<pre>`
   */
  isPreTag?: (tag: string) => boolean
  /**
   * Elements that should ignore the first newline token per parinsg spec
   * e.g. `<textarea>` and `<pre>`
   */
  isIgnoreNewlineTag?: (tag: string) => boolean
  /**
   * Platform-specific built-in components e.g. `<Transition>`
   */
  isBuiltInComponent?: (tag: string) => symbol | void
  /**
   * Separate option for end users to extend the native elements list
   */
  /**
   * 判断一个标签是否为自定义元素的函数
   */
  isCustomElement?: (tag: string) => boolean | void
  /**
   * Get tag namespace
   */
  getNamespace?: (
    tag: string,
    parent: ElementNode | undefined,
    rootNamespace: Namespace,
  ) => Namespace
  /**
   * @default ['{{', '}}']
   */
  delimiters?: [string, string]
  /**
   * Whitespace handling strategy
   * @default 'condense'
   */
  whitespace?: 'preserve' | 'condense'
  /**
   * Only used for DOM compilers that runs in the browser.
   * In non-browser builds, this option is ignored.
   */
  decodeEntities?: (rawText: string, asAttr: boolean) => string
  /**
   * Whether to keep comments in the templates AST.
   * This defaults to `true` in development and `false` in production builds.
   */
  comments?: boolean
  /**
   * Parse JavaScript expressions with Babel.
   * @default false
   */
  prefixIdentifiers?: boolean
  /**
   * 为`@babel/parser`启用的解析器插件列表
   * 用于解析绑定和插值中的表达式
   * @see https://babeljs.io/docs/en/next/babel-parser#plugins
   */
  expressionPlugins?: ParserPlugin[]
}

export type HoistTransform = (
  children: TemplateChildNode[],
  context: TransformContext,
  parent: ParentNode,
) => void

export enum BindingTypes {
  /**
   * returned from data()
   */
  DATA = 'data',
  /**
   * declared as a prop
   */
  PROPS = 'props',
  /**
   * a local alias of a `<script setup>` destructured prop.
   * the original is stored in __propsAliases of the bindingMetadata object.
   */
  PROPS_ALIASED = 'props-aliased',
  /**
   * a let binding (may or may not be a ref)
   */
  SETUP_LET = 'setup-let',
  /**
   * a const binding that can never be a ref.
   * these bindings don't need `unref()` calls when processed in inlined
   * template expressions.
   */
  SETUP_CONST = 'setup-const',
  /**
   * a const binding that does not need `unref()`, but may be mutated.
   */
  SETUP_REACTIVE_CONST = 'setup-reactive-const',
  /**
   * a const binding that may be a ref.
   */
  SETUP_MAYBE_REF = 'setup-maybe-ref',
  /**
   * bindings that are guaranteed to be refs
   */
  SETUP_REF = 'setup-ref',
  /**
   * declared by other options, e.g. computed, inject
   */
  OPTIONS = 'options',
  /**
   * a literal constant, e.g. 'foo', 1, true
   */
  LITERAL_CONST = 'literal-const',
}

export type BindingMetadata = {
  [key: string]: BindingTypes | undefined
} & {
  __isScriptSetup?: boolean
  __propsAliases?: Record<string, string>
}

/**
 * 转换和代码生成共享选项
 * 包含同时影响转换和代码生成的配置
 */
interface SharedTransformCodegenOptions {
  /**
   * 将表达式如 {{ foo }} 转换为 `_ctx.foo`
   * 如果此选项为false，生成的代码将被包装在`with (this) { ... }`块中
   * - 在模块模式下此选项被强制启用，因为模块默认是严格模式，不能使用`with`
   * @default mode === 'module'
   */
  prefixIdentifiers?: boolean
  /**
   * 控制是否生成SSR优化的渲染函数
   * 生成的函数必须通过`ssrRender`选项而不是`render`附加到组件
   *
   * 当编译器为SSR的回退分支生成代码时，需要将其设置为false:
   *  - context.ssr = false
   *
   * 参见`ssrTransformComponent.ts`中的`subTransform`
   */
  ssr?: boolean
  /**
   * 指示编译器是否为SSR生成代码
   * 为SSR生成代码时始终为true，无论是否为SSR的回退分支生成代码
   * 这意味着当编译器为SSR的回退分支生成代码时:
   *  - context.ssr = false
   *  - context.inSSR = true
   */
  inSSR?: boolean
  /**
   * 从脚本分析的可选绑定元数据
   * 用于在启用`prefixIdentifiers`时优化绑定访问
   */
  bindingMetadata?: BindingMetadata
  /**
   * 编译函数以便内联到setup()中
   * 这允许函数直接访问setup()的本地绑定
   */
  inline?: boolean
  /**
   * 指示转换和代码生成应尝试输出有效的TS代码
   */
  isTS?: boolean
  /**
   * 用于生成源映射的文件名
   * 也用于模板中的自递归引用
   * @default 'template.vue.html'
   */
  filename?: string
}

/**
 * 转换选项
 * 用于配置AST转换过程中的各种行为
 * 继承自共享转换代码生成选项、错误处理选项和编译器兼容性选项
 */
export interface TransformOptions
  extends SharedTransformCodegenOptions,
    ErrorHandlingOptions,
    CompilerCompatOptions {
  /**
   * 应用于每个AST节点的节点转换数组
   */
  nodeTransforms?: NodeTransform[]
  /**
   * {名称: 转换}对象，应用于在元素节点上找到的每个指令属性节点
   */
  directiveTransforms?: Record<string, DirectiveTransform | undefined>
  /**
   * 转换被提升节点的可选钩子
   * 被compiler-dom用于将提升的节点转换为字符串化的HTML虚拟节点
   * @default null
   */
  transformHoist?: HoistTransform | null
  /**
   * If the pairing runtime provides additional built-in elements, use this to
   * mark them as built-in so the compiler will generate component vnodes
   * for them.
   */
  isBuiltInComponent?: (tag: string) => symbol | void
  /**
   * Used by some transforms that expects only native elements
   */
  isCustomElement?: (tag: string) => boolean | void
  /**
   * 将表达式如 {{ foo }} 转换为 `_ctx.foo`
   * 如果此选项为false，生成的代码将被包装在`with (this) { ... }`块中
   * - 在模块模式下此选项被强制启用，因为模块默认是严格模式，不能使用`with`
   * @default mode === 'module'
   */
  prefixIdentifiers?: boolean
  /**
   * 将静态虚拟节点和属性对象缓存到`_hoisted_x`常量中
   * @default false
   */
  hoistStatic?: boolean
  /**
   * 缓存v-on处理器，避免在每次渲染时创建新的内联函数
   * 也避免了通过包装来动态修补处理器的需要
   * 例如`@click="foo"`默认编译为`{ onClick: foo }`。启用此选项后编译为:
   * ```js
   * { onClick: _cache[0] || (_cache[0] = e => _ctx.foo(e)) }
   * ```
   * - 需要启用"prefixIdentifiers"，因为它依赖于作用域分析来确定处理器是否安全缓存
   * @default false
   */
  cacheHandlers?: boolean
  /**
   * A list of parser plugins to enable for `@babel/parser`, which is used to
   * parse expressions in bindings and interpolations.
   * https://babeljs.io/docs/en/next/babel-parser#plugins
   */
  expressionPlugins?: ParserPlugin[]
  /**
   * 单文件组件(SFC)的作用域样式ID
   */
  scopeId?: string | null
  /**
   * 指示此SFC模板在其样式中使用了:slotted
   * 为了向后兼容，默认为`true` - 如果在`<style>`中未检测到`:slotted`使用，SFC工具应将其设置为`false`
   */
  slotted?: boolean
  /**
   * 单文件组件(SFC)的`<style vars>`注入字符串
   * 应该已经是一个对象表达式，例如`{ 'xxxx-color': color }`
   * 用于在组件根节点上渲染内联CSS变量
   */
  ssrCssVars?: string
  /**
   * 是否假设模板需要处理热模块替换(HMR)来进行编译
   * 一些边缘情况可能需要生成不同的代码才能使HMR正常工作
   * 例如 #6938, #7138
   */
  hmr?: boolean
}

/**
 * 代码生成选项
 * 用于配置代码生成过程中的各种行为
 * 继承自共享转换代码生成选项
 */
export interface CodegenOptions extends SharedTransformCodegenOptions {
  /**
   * 代码生成模式
   * - `module`模式将为帮助函数生成ES模块导入语句，并将渲染函数作为默认导出
   * - `function`模式将生成一个`const { helpers... } = Vue`语句并返回渲染函数
   *   它期望`Vue`是全局可用的（或通过用IIFE包装代码来传递）
   *   它旨在与`new Function(code)()`一起使用，以在运行时生成渲染函数
   * @default 'function'
   */
  mode?: 'module' | 'function'
  /**
   * 是否生成源映射
   * @default false
   */
  sourceMap?: boolean
  /**
   * 单文件组件(SFC)的作用域样式ID
   */
  scopeId?: string | null
  /**
   * 通过变量赋值优化帮助函数导入绑定的选项
   * （仅用于webpack代码拆分）
   * @default false
   */
  optimizeImports?: boolean
  /**
   * 自定义从哪里导入运行时帮助函数
   * @default 'vue'
   */
  runtimeModuleName?: string
  /**
   * 自定义从哪里导入SSR运行时帮助函数
   * @default 'vue/server-renderer'
   */
  ssrRuntimeModuleName?: string
  /**
   * 自定义在函数模式下获取帮助函数的`Vue`全局变量名称
   * @default 'Vue'
   */
  runtimeGlobalName?: string
}

/**
 * 编译器选项
 * 组合了解析器选项、转换选项和代码生成选项
 * 用于配置整个模板编译过程
 */
export type CompilerOptions = ParserOptions & TransformOptions & CodegenOptions
