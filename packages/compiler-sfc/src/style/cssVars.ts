/**
 * CSS 变量处理工具
 * 用于处理 Vue 单文件组件中 CSS 变量与 JavaScript 表达式的绑定
 * 提供 CSS 变量的解析、生成和转换功能
 */
import {
  type BindingMetadata,
  NodeTypes,
  type SimpleExpressionNode,
  createRoot,
  createSimpleExpression,
  createTransformContext,
  processExpression,
} from '@vue/compiler-dom'
import type { SFCDescriptor } from '../parse'
import type { PluginCreator } from 'postcss'
import hash from 'hash-sum'
import { getEscapedCssVarName } from '@vue/shared'

/**
 * CSS 变量助手函数名称
 * @constant {string}
 */
export const CSS_VARS_HELPER = `useCssVars`

/**
 * 从变量列表生成 CSS 变量对象代码
 * @param {string[]} vars - CSS 变量名称列表
 * @param {string} id - 组件 ID
 * @param {boolean} isProd - 是否为生产环境
 * @param {boolean} [isSSR=false] - 是否为服务端渲染
 * @returns {string} 生成的 CSS 变量对象代码
 * @example
 * ```javascript
 * genCssVarsFromList(['color', 'size'], 'comp-1', false)
 * // 返回: "{
 * //   "comp-1-color": (color),
 * //   "comp-1-size": (size)
 * // }"
 * ```
 */
export function genCssVarsFromList(
  vars: string[],
  id: string,
  isProd: boolean,
  isSSR = false,
): string {
  return `{\n  ${vars
    .map(
      key =>
        // The `:` prefix here is used in `ssrRenderStyle` to distinguish whether
        // a custom property comes from `ssrCssVars`. If it does, we need to reset
        // its value to `initial` on the component instance to avoid unintentionally
        // inheriting the same property value from a different instance of the same
        // component in the outer scope.
        `"${isSSR ? `:--` : ``}${genVarName(id, key, isProd, isSSR)}": (${key})`,
    )
    .join(',\n  ')}\n}`
}

/**
 * 生成 CSS 变量名称
 * @param {string} id - 组件 ID
 * @param {string} raw - 原始变量名
 * @param {boolean} isProd - 是否为生产环境
 * @param {boolean} [isSSR=false] - 是否为服务端渲染
 * @returns {string} 生成的 CSS 变量名称
 */
function genVarName(
  id: string,
  raw: string,
  isProd: boolean,
  isSSR = false,
): string {
  if (isProd) {
    return hash(id + raw)
  } else {
    // escape ASCII Punctuation & Symbols
    // #7823 need to double-escape in SSR because the attributes are rendered
    // into an HTML string
    return `${id}-${getEscapedCssVarName(raw, isSSR)}`
  }
}

/**
 * 规范化表达式字符串
 * @param {string} exp - 表达式字符串
 * @returns {string} 规范化后的表达式
 */
function normalizeExpression(exp: string) {
  exp = exp.trim()
  if (
    (exp[0] === `'` && exp[exp.length - 1] === `'`) ||
    (exp[0] === `"` && exp[exp.length - 1] === `"`)
  ) {
    return exp.slice(1, -1)
  }
  return exp
}

/**
 * 匹配 CSS 中 v-bind() 语法的正则表达式
 * @constant {RegExp}
 */
const vBindRE = /v-bind\s*\(/g

/**
 * 解析 SFC 中的 CSS 变量
 * @param {SFCDescriptor} sfc - 单文件组件描述符
 * @returns {string[]} 解析出的 CSS 变量列表
 */
export function parseCssVars(sfc: SFCDescriptor): string[] {
  const vars: string[] = []
  sfc.styles.forEach(style => {
    let match
    // ignore v-bind() in comments, eg /* ... */
    // and // (Less, Sass and Stylus all support the use of // to comment)
    const content = style.content.replace(/\/\*([\s\S]*?)\*\/|\/\/.*/g, '')
    while ((match = vBindRE.exec(content))) {
      const start = match.index + match[0].length
      const end = lexBinding(content, start)
      if (end !== null) {
        const variable = normalizeExpression(content.slice(start, end))
        if (!vars.includes(variable)) {
          vars.push(variable)
        }
      }
    }
  })
  return vars
}

/**
 * 词法分析器状态枚举
 * @enum {number}
 */
enum LexerState {
  inParens,
  inSingleQuoteString,
  inDoubleQuoteString,
}

/**
 * 解析 CSS 中的绑定表达式
 * @param {string} content - CSS 内容
 * @param {number} start - 开始位置
 * @returns {number | null} 表达式结束位置，如果未找到则返回 null
 */
function lexBinding(content: string, start: number): number | null {
  let state: LexerState = LexerState.inParens
  let parenDepth = 0

  for (let i = start; i < content.length; i++) {
    const char = content.charAt(i)
    switch (state) {
      case LexerState.inParens:
        if (char === `'`) {
          state = LexerState.inSingleQuoteString
        } else if (char === `"`) {
          state = LexerState.inDoubleQuoteString
        } else if (char === `(`) {
          parenDepth++
        } else if (char === `)`) {
          if (parenDepth > 0) {
            parenDepth--
          } else {
            return i
          }
        }
        break
      case LexerState.inSingleQuoteString:
        if (char === `'`) {
          state = LexerState.inParens
        }
        break
      case LexerState.inDoubleQuoteString:
        if (char === `"`) {
          state = LexerState.inParens
        }
        break
    }
  }
  return null
}

// for compileStyle
/**
 * CSS 变量插件选项接口
 * @interface CssVarsPluginOptions
 * @property {string} id - 组件 ID
 * @property {boolean} isProd - 是否为生产环境
 */
export interface CssVarsPluginOptions {
  id: string
  isProd: boolean
}

/**
 * PostCSS 插件，用于处理 CSS 中的 v-bind() 语法
 * @type {PluginCreator<CssVarsPluginOptions>}
 * @param {CssVarsPluginOptions} opts - 插件选项
 * @returns {Object} PostCSS 插件对象
 */
export const cssVarsPlugin: PluginCreator<CssVarsPluginOptions> = opts => {
  const { id, isProd } = opts!
  return {
    postcssPlugin: 'vue-sfc-vars',
    Declaration(decl) {
      // rewrite CSS variables
      const value = decl.value
      if (vBindRE.test(value)) {
        vBindRE.lastIndex = 0
        let transformed = ''
        let lastIndex = 0
        let match
        while ((match = vBindRE.exec(value))) {
          const start = match.index + match[0].length
          const end = lexBinding(value, start)
          if (end !== null) {
            const variable = normalizeExpression(value.slice(start, end))
            transformed +=
              value.slice(lastIndex, match.index) +
              `var(--${genVarName(id, variable, isProd)})`
            lastIndex = end + 1
          }
        }
        decl.value = transformed + value.slice(lastIndex)
      }
    },
  }
}
cssVarsPlugin.postcss = true

/**
 * 生成 CSS 变量代码
 * @param {string[]} vars - CSS 变量列表
 * @param {BindingMetadata} bindings - 绑定元数据
 * @param {string} id - 组件 ID
 * @param {boolean} isProd - 是否为生产环境
 * @returns {string} 生成的 CSS 变量代码
 */
export function genCssVarsCode(
  vars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean,
) {
  const varsExp = genCssVarsFromList(vars, id, isProd)
  const exp = createSimpleExpression(varsExp, false)
  const context = createTransformContext(createRoot([]), {
    prefixIdentifiers: true,
    inline: true,
    bindingMetadata: bindings.__isScriptSetup === false ? undefined : bindings,
  })
  const transformed = processExpression(exp, context)
  const transformedString =
    transformed.type === NodeTypes.SIMPLE_EXPRESSION
      ? transformed.content
      : transformed.children
          .map(c => {
            return typeof c === 'string'
              ? c
              : (c as SimpleExpressionNode).content
          })
          .join('')

  return `_${CSS_VARS_HELPER}(_ctx => (${transformedString}))`
}

// <script setup> already gets the calls injected as part of the transform
// this is only for single normal <script>
/**
 * 为普通脚本生成 CSS 变量代码
 * @param {string[]} cssVars - CSS 变量列表
 * @param {BindingMetadata} bindings - 绑定元数据
 * @param {string} id - 组件 ID
 * @param {boolean} isProd - 是否为生产环境
 * @param {string} defaultVar - 默认变量名
 * @returns {string} 生成的 CSS 变量代码
 */
export function genNormalScriptCssVarsCode(
  cssVars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean,
  defaultVar: string,
): string {
  return (
    `\nimport { ${CSS_VARS_HELPER} as _${CSS_VARS_HELPER} } from 'vue'\n` +
    `const __injectCSSVars__ = () => {\n${genCssVarsCode(
      cssVars,
      bindings,
      id,
      isProd,
    )}}\n` +
    `const __setup__ = ${defaultVar}.setup\n` +
    `${defaultVar}.setup = __setup__\n` +
    `  ? (props, ctx) => { __injectCSSVars__();return __setup__(props, ctx) }\n` +
    `  : __injectCSSVars__\n`
  )
}
