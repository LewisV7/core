/**
 * 代码生成器模块
 * 负责将编译后的 AST 转换为可执行的 JavaScript/TypeScript 代码
 */
import type { CodegenOptions } from './options'
import {
  type ArrayExpression,
  type AssignmentExpression,
  type CacheExpression,
  type CallExpression,
  type CommentNode,
  type CompoundExpressionNode,
  type ConditionalExpression,
  type ExpressionNode,
  type FunctionExpression,
  type IfStatement,
  type InterpolationNode,
  type JSChildNode,
  NodeTypes,
  type ObjectExpression,
  type Position,
  type ReturnStatement,
  type RootNode,
  type SSRCodegenNode,
  type SequenceExpression,
  type SimpleExpressionNode,
  type TemplateChildNode,
  type TemplateLiteral,
  type TextNode,
  type VNodeCall,
  getVNodeBlockHelper,
  getVNodeHelper,
  locStub,
} from './ast' // 导入 AST 相关类型和工具函数
import { SourceMapGenerator } from 'source-map-js' // 导入源代码映射生成器
import {
  advancePositionWithMutation,
  assert,
  isSimpleIdentifier,
  toValidAssetId,
} from './utils' // 导入工具函数
import {
  PatchFlagNames,
  type PatchFlags,
  isArray,
  isString,
  isSymbol,
} from '@vue/shared' // 导入共享工具函数和类型
import {
  CREATE_COMMENT,
  CREATE_ELEMENT_VNODE,
  CREATE_STATIC,
  CREATE_TEXT,
  CREATE_VNODE,
  OPEN_BLOCK,
  RESOLVE_COMPONENT,
  RESOLVE_DIRECTIVE,
  RESOLVE_FILTER,
  SET_BLOCK_TRACKING,
  TO_DISPLAY_STRING,
  WITH_CTX,
  WITH_DIRECTIVES,
  helperNameMap,
} from './runtimeHelpers' // 导入运行时辅助函数
import type { ImportItem } from './transform' // 导入转换相关类型

/**
 * `SourceMapGenerator` 类型扩展
 * 补充 `source-map-js` 库中缺少的 `toJSON()` 方法定义
 * 并添加我们需要访问的内部属性类型以提高性能
 *
 * 由于 TS 5.3 开始，dts 生成会奇怪地包含 source-map-js 的错误三斜杠引用
 * 因此我们在此处内联所有与 source map 相关的类型以解决此问题
 */
/**
 * 代码生成器源代码映射生成器接口
 */
export interface CodegenSourceMapGenerator {
  setSourceContent(sourceFile: string, sourceContent: string): void
  // SourceMapGenerator has this method but the types do not include it
  toJSON(): RawSourceMap
  _sources: Set<string>
  _names: Set<string>
  _mappings: {
    add(mapping: MappingItem): void
  }
}

/**
 * 原始源代码映射接口
 */
export interface RawSourceMap {
  file?: string
  sourceRoot?: string
  version: string
  sources: string[]
  names: string[]
  sourcesContent?: string[]
  mappings: string
}

/**
 * 映射项接口
 * 表示源代码和生成代码之间的位置映射
 */
interface MappingItem {
  source: string
  generatedLine: number
  generatedColumn: number
  originalLine: number
  originalColumn: number
  name: string | null
}

/**
 * 纯函数注释
 * 用于标记纯函数，帮助压缩工具识别不会产生副作用的代码
 */
const PURE_ANNOTATION = `/*@__PURE__*/`

/**
 * 辅助函数别名生成器
 * @param s - 辅助函数的 symbol 键
 * @returns 格式化的别名字符串
 */
const aliasHelper = (s: symbol) => `${helperNameMap[s]}: _${helperNameMap[s]}`

/**
 * 代码生成节点类型
 * 可以是模板子节点、JS 子节点或 SSR 代码生成节点
 */
type CodegenNode = TemplateChildNode | JSChildNode | SSRCodegenNode

/**
 * 代码生成结果接口
 */
export interface CodegenResult {
  code: string
  preamble: string
  ast: RootNode
  map?: RawSourceMap
}

/**
 * 换行符类型枚举
 */
enum NewlineType {
  Start = 0, // 开始处换行
  End = -1, // 结束处换行
  None = -2, // 不换行
  Unknown = -3, // 未知换行类型
}

/**
 * 代码生成上下文接口
 */
export interface CodegenContext
  extends Omit<Required<CodegenOptions>, 'bindingMetadata' | 'inline'> {
  source: string
  code: string
  line: number
  column: number
  offset: number
  indentLevel: number
  pure: boolean
  map?: CodegenSourceMapGenerator
  helper(key: symbol): string
  push(code: string, newlineIndex?: number, node?: CodegenNode): void
  // 增加缩进
  indent(): void
  deindent(withoutNewLine?: boolean): void
  newline(): void
}

/**
 * 创建代码生成上下文
 * @param ast - 根 AST 节点
 * @param options - 代码生成选项
 * @returns 代码生成上下文对象
 */
function createCodegenContext(
  ast: RootNode,
  {
    mode = 'function',
    prefixIdentifiers = mode === 'module',
    sourceMap = false,
    filename = `template.vue.html`,
    scopeId = null,
    optimizeImports = false,
    runtimeGlobalName = `Vue`,
    runtimeModuleName = `vue`,
    ssrRuntimeModuleName = 'vue/server-renderer',
    ssr = false,
    isTS = false,
    inSSR = false,
  }: CodegenOptions,
): CodegenContext {
  const context: CodegenContext = {
    mode,
    prefixIdentifiers,
    sourceMap,
    filename,
    scopeId,
    optimizeImports,
    runtimeGlobalName,
    runtimeModuleName,
    ssrRuntimeModuleName,
    ssr,
    isTS,
    inSSR,
    source: ast.source,
    code: ``,
    column: 1,
    line: 1,
    offset: 0,
    indentLevel: 0,
    pure: false,
    map: undefined,
    helper(key) {
      return `_${helperNameMap[key]}`
    },
    push(code, newlineIndex = NewlineType.None, node) {
      context.code += code
      if (!__BROWSER__ && context.map) {
        if (node) {
          let name
          if (node.type === NodeTypes.SIMPLE_EXPRESSION && !node.isStatic) {
            const content = node.content.replace(/^_ctx\./, '')
            if (content !== node.content && isSimpleIdentifier(content)) {
              name = content
            }
          }
          if (node.loc.source) {
            addMapping(node.loc.start, name)
          }
        }
        if (newlineIndex === NewlineType.Unknown) {
          // multiple newlines, full iteration
          // 更新位置信息
          advancePositionWithMutation(context, code)
        } else {
          // 快速路径处理
          context.offset += code.length
          if (newlineIndex === NewlineType.None) {
            // no newlines; fast path to avoid newline detection
            if (__TEST__ && code.includes('\n')) {
              throw new Error(
                `CodegenContext.push() called newlineIndex: none, but contains` +
                  `newlines: ${code.replace(/\n/g, '\\n')}`,
              )
            }
            context.column += code.length
          } else {
            // single newline at known index
            if (newlineIndex === NewlineType.End) {
              newlineIndex = code.length - 1
            }
            if (
              __TEST__ &&
              (code.charAt(newlineIndex) !== '\n' ||
                code.slice(0, newlineIndex).includes('\n') ||
                code.slice(newlineIndex + 1).includes('\n'))
            ) {
              throw new Error(
                `CodegenContext.push() called with newlineIndex: ${newlineIndex} ` +
                  `but does not conform: ${code.replace(/\n/g, '\\n')}`,
              )
            }
            context.line++
            context.column = code.length - newlineIndex
          }
        }
        if (node && node.loc !== locStub && node.loc.source) {
          addMapping(node.loc.end)
        }
      }
    },
    indent() {
      newline(++context.indentLevel)
    },
    deindent(withoutNewLine = false) {
      if (withoutNewLine) {
        --context.indentLevel
      } else {
        newline(--context.indentLevel)
      }
    },
    /**
     * 按当前缩进级别换行
     */
    newline() {
      newline(context.indentLevel)
    },
  }

  /**
   * 生成带缩进的换行
   * @param n - 缩进级别
   */
  function newline(n: number) {
    context.push('\n' + `  `.repeat(n), NewlineType.Start)
  }

  /**
   * 添加源代码映射
   * @param loc - 源代码位置
   * @param name - 标识符名称
   */
  function addMapping(loc: Position, name: string | null = null) {
    // 直接使用私有属性添加映射
    // 因为 source-map-js 中的 addMapping() 实现有很多不必要的参数和验证检查
    // 在我们的情况下这些都是纯开销
    const { _names, _mappings } = context.map!
    if (name !== null && !_names.has(name)) _names.add(name)
    _mappings.add({
      originalLine: loc.line,
      originalColumn: loc.column - 1, // source-map 列是从 0 开始的
      generatedLine: context.line,
      generatedColumn: context.column - 1,
      source: filename,
      name,
    })
  }

  // 非浏览器环境且开启源代码映射时初始化映射生成器
  if (!__BROWSER__ && sourceMap) {
    // 延迟加载 source-map 实现，仅在非浏览器构建中使用
    context.map =
      new SourceMapGenerator() as unknown as CodegenSourceMapGenerator
    context.map.setSourceContent(filename, context.source)
    context.map._sources.add(filename)
  }

  return context
}

/**
 * 生成代码
 * @param ast - 根 AST 节点
 * @param options - 代码生成选项
 * @returns 代码生成结果
 */
export function generate(
  ast: RootNode,
  options: CodegenOptions & {
    onContextCreated?: (context: CodegenContext) => void
  } = {},
): CodegenResult {
  // 创建代码生成上下文
  const context = createCodegenContext(ast, options)
  // 如果提供了上下文创建回调，则调用它
  if (options.onContextCreated) options.onContextCreated(context)
  // 从上下文中提取所需的属性
  const {
    mode,
    push,
    prefixIdentifiers,
    indent,
    deindent,
    newline,
    scopeId,
    ssr,
  } = context

  // 获取所有辅助函数
  const helpers = Array.from(ast.helpers)
  // 是否有辅助函数
  const hasHelpers = helpers.length > 0
  // 是否使用 with 块
  // 当不使用前缀标识符且模式不是模块时使用 with 块
  const useWithBlock = !prefixIdentifiers && mode !== 'module'
  // 是否生成作用域 ID
  const genScopeId = !__BROWSER__ && scopeId != null && mode === 'module'
  // 是否内联 setup
  const isSetupInlined = !__BROWSER__ && !!options.inline

  // 前置代码
  // 在 setup() 内联模式下，前置代码在子上下文中生成并单独返回
  // 创建前置代码上下文
  const preambleContext = isSetupInlined
    ? createCodegenContext(ast, options)
    : context
  // 非浏览器环境且模块模式下生成模块前置代码
  if (!__BROWSER__ && mode === 'module') {
    genModulePreamble(ast, preambleContext, genScopeId, isSetupInlined)
  } else {
    // 生成函数前置代码
    genFunctionPreamble(ast, preambleContext)
  }
  // 进入渲染函数
  // 确定函数名称
  const functionName = ssr ? `ssrRender` : `render`
  // 确定函数参数
  const args = ssr ? ['_ctx', '_push', '_parent', '_attrs'] : ['_ctx', '_cache']
  // 非浏览器环境且有绑定元数据且非内联模式下添加额外参数
  if (!__BROWSER__ && options.bindingMetadata && !options.inline) {
    // 绑定优化参数
    args.push('$props', '$setup', '$data', '$options')
  }
  // 生成函数签名
  const signature =
    !__BROWSER__ && options.isTS
      ? args.map(arg => `${arg}: any`).join(',')
      : args.join(', ')

  // 如果是内联 setup 模式
  if (isSetupInlined) {
    push(`(${signature}) => {`)
  } else {
    // 生成函数定义
    push(`function ${functionName}(${signature}) {`)
  }
  indent()

  // 如果使用 with 块
  if (useWithBlock) {
    push(`with (_ctx) {`)
    // 增加缩进
    indent()
    // 函数模式下的常量声明应该在 with 块内
    // 并且应该重命名以避免与用户属性冲突
    // 如果有辅助函数
    if (hasHelpers) {
      // 生成辅助函数常量声明
      push(
        `const { ${helpers.map(aliasHelper).join(', ')} } = _Vue\n`,
        NewlineType.End,
      )
      // 换行
      // 换行
      newline()
    }
  }

  // 生成资源解析语句
  // 如果有组件
  if (ast.components.length) {
    // 生成组件资源
    genAssets(ast.components, 'component', context)
    // 如果有指令或临时变量
    if (ast.directives.length || ast.temps > 0) {
      newline()
    }
  }
  // 如果有指令
  if (ast.directives.length) {
    // 生成指令资源
    genAssets(ast.directives, 'directive', context)
    // 如果有临时变量
    if (ast.temps > 0) {
      newline()
    }
  }
  // 兼容模式下如果有过滤器
  if (__COMPAT__ && ast.filters && ast.filters.length) {
    newline()
    // 生成过滤器资源
    genAssets(ast.filters, 'filter', context)
    newline()
  }

  if (ast.temps > 0) {
    // 生成 let 声明
    push(`let `)
    // 循环生成临时变量
    for (let i = 0; i < ast.temps; i++) {
      push(`${i > 0 ? `, ` : ``}_temp${i}`)
    }
  }
  // 如果有组件、指令或临时变量
  if (ast.components.length || ast.directives.length || ast.temps) {
    push(`\n`, NewlineType.Start)
    // 换行
    newline()
  }

  // 生成 VNode 树表达式
  // 非 SSR 模式下
  if (!ssr) {
    // 添加 return 语句
    push(`return `)
  }
  // 如果有代码生成节点
  if (ast.codegenNode) {
    // 生成节点
    genNode(ast.codegenNode, context)
  } else {
    // 否则返回 null
    push(`null`)
  }

  if (useWithBlock) {
    // 减少缩进
    // 减少缩进
    deindent()
    push(`}`)
  }

  deindent()
  push(`}`)

  // 返回代码生成结果
  return {
    ast,
    code: context.code,
    preamble: isSetupInlined ? preambleContext.code : ``,
    map: context.map ? context.map.toJSON() : undefined,
  }
}

/**
 * 生成函数前置代码
 * @param ast - 根 AST 节点
 * @param context - 代码生成上下文
 */
function genFunctionPreamble(ast: RootNode, context: CodegenContext) {
  // 从上下文中提取所需的属性
  const {
    ssr,
    prefixIdentifiers,
    push,
    newline,
    runtimeModuleName,
    runtimeGlobalName,
    ssrRuntimeModuleName,
  } = context
  // 确定 Vue 绑定方式
  const VueBinding =
    !__BROWSER__ && ssr
      ? `require(${JSON.stringify(runtimeModuleName)})`
      : runtimeGlobalName
  // 生成辅助函数的常量声明
  // 在前缀模式下，我们将常量声明放在顶部，这样只做一次
  // 但如果不使用前缀，我们将声明放在 with 块内，这样就不会为每次辅助函数访问产生 `in` 检查成本
  const helpers = Array.from(ast.helpers)
  if (helpers.length > 0) {
    if (!__BROWSER__ && prefixIdentifiers) {
      push(
        `const { ${helpers.map(aliasHelper).join(', ')} } = ${VueBinding}\n`,
        NewlineType.End,
      )
    } else {
      // "with" mode.
      // save Vue in a separate variable to avoid collision
      push(`const _Vue = ${VueBinding}\n`, NewlineType.End)
      // in "with" mode, helpers are declared inside the with block to avoid
      // has check cost, but hoists are lifted out of the function - we need
      // to provide the helper here.
      if (ast.hoists.length) {
        const staticHelpers = [
          CREATE_VNODE,
          CREATE_ELEMENT_VNODE,
          CREATE_COMMENT,
          CREATE_TEXT,
          CREATE_STATIC,
        ]
          .filter(helper => helpers.includes(helper))
          .map(aliasHelper)
          .join(', ')
        push(`const { ${staticHelpers} } = _Vue\n`, NewlineType.End)
      }
    }
  }
  // generate variables for ssr helpers
  if (!__BROWSER__ && ast.ssrHelpers && ast.ssrHelpers.length) {
    // ssr guarantees prefixIdentifier: true
    push(
      `const { ${ast.ssrHelpers
        .map(aliasHelper)
        .join(', ')} } = require("${ssrRuntimeModuleName}")\n`,
      NewlineType.End,
    )
  }
  genHoists(ast.hoists, context)
  newline()
  push(`return `)
}

/**
 * 生成模块前置代码
 * @param ast - 根 AST 节点
 * @param context - 代码生成上下文
 * @param genScopeId - 是否生成作用域 ID
 * @param inline - 是否内联
 */
function genModulePreamble(
  ast: RootNode,
  context: CodegenContext,
  genScopeId: boolean,
  inline?: boolean,
) {
  const {
    push,
    newline,
    optimizeImports,
    runtimeModuleName,
    ssrRuntimeModuleName,
  } = context

  // generate import statements for helpers
  if (ast.helpers.size) {
    const helpers = Array.from(ast.helpers)
    if (optimizeImports) {
      // when bundled with webpack with code-split, calling an import binding
      // as a function leads to it being wrapped with `Object(a.b)` or `(0,a.b)`,
      // incurring both payload size increase and potential perf overhead.
      // therefore we assign the imports to variables (which is a constant ~50b
      // cost per-component instead of scaling with template size)
      push(
        `import { ${helpers
          .map(s => helperNameMap[s])
          .join(', ')} } from ${JSON.stringify(runtimeModuleName)}\n`,
        NewlineType.End,
      )
      push(
        `\n// Binding optimization for webpack code-split\nconst ${helpers
          .map(s => `_${helperNameMap[s]} = ${helperNameMap[s]}`)
          .join(', ')}\n`,
        NewlineType.End,
      )
    } else {
      push(
        `import { ${helpers
          .map(s => `${helperNameMap[s]} as _${helperNameMap[s]}`)
          .join(', ')} } from ${JSON.stringify(runtimeModuleName)}\n`,
        NewlineType.End,
      )
    }
  }

  if (ast.ssrHelpers && ast.ssrHelpers.length) {
    push(
      `import { ${ast.ssrHelpers
        .map(s => `${helperNameMap[s]} as _${helperNameMap[s]}`)
        .join(', ')} } from "${ssrRuntimeModuleName}"\n`,
      NewlineType.End,
    )
  }

  if (ast.imports.length) {
    genImports(ast.imports, context)
    newline()
  }

  genHoists(ast.hoists, context)
  newline()

  if (!inline) {
    push(`export `)
  }
}

/**
 * 生成资源解析语句
 * @param assets - 资源名称数组
 * @param type - 资源类型（组件、指令或过滤器）
 * @param context - 代码生成上下文
 */
function genAssets(
  assets: string[],
  type: 'component' | 'directive' | 'filter',
  { helper, push, newline, isTS }: CodegenContext,
) {
  const resolver = helper(
    __COMPAT__ && type === 'filter'
      ? RESOLVE_FILTER
      : type === 'component'
        ? RESOLVE_COMPONENT
        : RESOLVE_DIRECTIVE,
  )
  for (let i = 0; i < assets.length; i++) {
    let id = assets[i]
    // potential component implicit self-reference inferred from SFC filename
    const maybeSelfReference = id.endsWith('__self')
    if (maybeSelfReference) {
      id = id.slice(0, -6)
    }
    push(
      `const ${toValidAssetId(id, type)} = ${resolver}(${JSON.stringify(id)}${
        maybeSelfReference ? `, true` : ``
      })${isTS ? `!` : ``}`,
    )
    if (i < assets.length - 1) {
      newline()
    }
  }
}

/**
 * 生成提升的变量
 * @param hoists - 提升的节点数组
 * @param context - 代码生成上下文
 */
function genHoists(hoists: (JSChildNode | null)[], context: CodegenContext) {
  if (!hoists.length) {
    return
  }
  context.pure = true
  const { push, newline } = context
  newline()

  for (let i = 0; i < hoists.length; i++) {
    const exp = hoists[i]
    if (exp) {
      push(`const _hoisted_${i + 1} = `)
      genNode(exp, context)
      newline()
    }
  }

  context.pure = false
}

/**
 * 生成导入语句
 * @param importsOptions - 导入选项数组
 * @param context - 代码生成上下文
 */
function genImports(importsOptions: ImportItem[], context: CodegenContext) {
  if (!importsOptions.length) {
    return
  }
  importsOptions.forEach(imports => {
    context.push(`import `)
    genNode(imports.exp, context)
    context.push(` from '${imports.path}'`)
    context.newline()
  })
}

/**
 * 判断节点是否为文本类型
 * @param n - 要检查的节点
 * @returns 是否为文本类型
 */
function isText(n: string | CodegenNode) {
  return (
    isString(n) ||
    n.type === NodeTypes.SIMPLE_EXPRESSION ||
    n.type === NodeTypes.TEXT ||
    n.type === NodeTypes.INTERPOLATION ||
    n.type === NodeTypes.COMPOUND_EXPRESSION
  )
}

/**
 * 将节点列表生成为数组形式
 * @param nodes - 节点列表
 * @param context - 代码生成上下文
 */
function genNodeListAsArray(
  nodes: (string | CodegenNode | TemplateChildNode[])[],
  context: CodegenContext,
) {
  const multilines =
    nodes.length > 3 ||
    ((!__BROWSER__ || __DEV__) && nodes.some(n => isArray(n) || !isText(n)))
  context.push(`[`)
  multilines && context.indent()
  genNodeList(nodes, context, multilines)
  multilines && context.deindent()
  context.push(`]`)
}

/**
 * 生成节点列表
 * @param nodes - 节点列表
 * @param context - 代码生成上下文
 * @param multilines - 是否多行显示
 * @param comma - 是否添加逗号分隔符
 */
function genNodeList(
  nodes: (string | symbol | CodegenNode | TemplateChildNode[])[],
  context: CodegenContext,
  multilines: boolean = false,
  comma: boolean = true,
) {
  const { push, newline } = context
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (isString(node)) {
      push(node, NewlineType.Unknown)
    } else if (isArray(node)) {
      genNodeListAsArray(node, context)
    } else {
      genNode(node, context)
    }
    if (i < nodes.length - 1) {
      if (multilines) {
        comma && push(',')
        newline()
      } else {
        comma && push(', ')
      }
    }
  }
}

/**
 * 生成节点
 * @param node - 要生成的节点
 * @param context - 代码生成上下文
 */
function genNode(node: CodegenNode | symbol | string, context: CodegenContext) {
  if (isString(node)) {
    context.push(node, NewlineType.Unknown)
    return
  }
  if (isSymbol(node)) {
    context.push(context.helper(node))
    return
  }
  switch (node.type) {
    case NodeTypes.ELEMENT:
    case NodeTypes.IF:
    case NodeTypes.FOR:
      __DEV__ &&
        assert(
          node.codegenNode != null,
          `Codegen node is missing for element/if/for node. ` +
            `Apply appropriate transforms first.`,
        )
      genNode(node.codegenNode!, context)
      break
    case NodeTypes.TEXT:
      genText(node, context)
      break
    case NodeTypes.SIMPLE_EXPRESSION:
      genExpression(node, context)
      break
    case NodeTypes.INTERPOLATION:
      genInterpolation(node, context)
      break
    case NodeTypes.TEXT_CALL:
      genNode(node.codegenNode, context)
      break
    case NodeTypes.COMPOUND_EXPRESSION:
      genCompoundExpression(node, context)
      break
    case NodeTypes.COMMENT:
      genComment(node, context)
      break
    case NodeTypes.VNODE_CALL:
      genVNodeCall(node, context)
      break

    case NodeTypes.JS_CALL_EXPRESSION:
      genCallExpression(node, context)
      break
    case NodeTypes.JS_OBJECT_EXPRESSION:
      genObjectExpression(node, context)
      break
    case NodeTypes.JS_ARRAY_EXPRESSION:
      genArrayExpression(node, context)
      break
    case NodeTypes.JS_FUNCTION_EXPRESSION:
      genFunctionExpression(node, context)
      break
    case NodeTypes.JS_CONDITIONAL_EXPRESSION:
      genConditionalExpression(node, context)
      break
    case NodeTypes.JS_CACHE_EXPRESSION:
      genCacheExpression(node, context)
      break
    case NodeTypes.JS_BLOCK_STATEMENT:
      genNodeList(node.body, context, true, false)
      break

    // SSR only types
    case NodeTypes.JS_TEMPLATE_LITERAL:
      !__BROWSER__ && genTemplateLiteral(node, context)
      break
    case NodeTypes.JS_IF_STATEMENT:
      !__BROWSER__ && genIfStatement(node, context)
      break
    case NodeTypes.JS_ASSIGNMENT_EXPRESSION:
      !__BROWSER__ && genAssignmentExpression(node, context)
      break
    case NodeTypes.JS_SEQUENCE_EXPRESSION:
      !__BROWSER__ && genSequenceExpression(node, context)
      break
    case NodeTypes.JS_RETURN_STATEMENT:
      !__BROWSER__ && genReturnStatement(node, context)
      break

    /* v8 ignore start */
    case NodeTypes.IF_BRANCH:
      // noop
      break
    default:
      if (__DEV__) {
        assert(false, `unhandled codegen node type: ${(node as any).type}`)
        // make sure we exhaust all possible types
        const exhaustiveCheck: never = node
        return exhaustiveCheck
      }
    /* v8 ignore stop */
  }
}

/**
 * 生成文本节点
 * @param node - 文本节点
 * @param context - 代码生成上下文
 */
function genText(
  node: TextNode | SimpleExpressionNode,
  context: CodegenContext,
) {
  context.push(JSON.stringify(node.content), NewlineType.Unknown, node)
}

/**
 * 生成表达式
 * @param node - 表达式节点
 * @param context - 代码生成上下文
 */
function genExpression(node: SimpleExpressionNode, context: CodegenContext) {
  const { content, isStatic } = node
  context.push(
    isStatic ? JSON.stringify(content) : content,
    NewlineType.Unknown,
    node,
  )
}

/**
 * 生成插值表达式
 * @param node - 插值节点
 * @param context - 代码生成上下文
 */
function genInterpolation(node: InterpolationNode, context: CodegenContext) {
  const { push, helper, pure } = context
  if (pure) push(PURE_ANNOTATION)
  push(`${helper(TO_DISPLAY_STRING)}(`)
  genNode(node.content, context)
  push(`)`)
}

/**
 * 生成复合表达式
 * @param node - 复合表达式节点
 * @param context - 代码生成上下文
 */
function genCompoundExpression(
  node: CompoundExpressionNode,
  context: CodegenContext,
) {
  for (let i = 0; i < node.children!.length; i++) {
    const child = node.children![i]
    if (isString(child)) {
      context.push(child, NewlineType.Unknown)
    } else {
      genNode(child, context)
    }
  }
}

/**
 * 生成属性键表达式
 * @param node - 表达式节点
 * @param context - 代码生成上下文
 */
function genExpressionAsPropertyKey(
  node: ExpressionNode,
  context: CodegenContext,
) {
  const { push } = context
  if (node.type === NodeTypes.COMPOUND_EXPRESSION) {
    push(`[`)
    genCompoundExpression(node, context)
    push(`]`)
  } else if (node.isStatic) {
    // only quote keys if necessary
    const text = isSimpleIdentifier(node.content)
      ? node.content
      : JSON.stringify(node.content)
    push(text, NewlineType.None, node)
  } else {
    push(`[${node.content}]`, NewlineType.Unknown, node)
  }
}

/**
 * 生成注释节点
 * @param node - 注释节点
 * @param context - 代码生成上下文
 */
function genComment(node: CommentNode, context: CodegenContext) {
  const { push, helper, pure } = context
  if (pure) {
    push(PURE_ANNOTATION)
  }
  push(
    `${helper(CREATE_COMMENT)}(${JSON.stringify(node.content)})`,
    NewlineType.Unknown,
    node,
  )
}

/**
 * 生成 VNode 调用
 * @param node - VNode 调用节点
 * @param context - 代码生成上下文
 */
function genVNodeCall(node: VNodeCall, context: CodegenContext) {
  const { push, helper, pure } = context
  const {
    tag,
    props,
    children,
    patchFlag,
    dynamicProps,
    directives,
    isBlock,
    disableTracking,
    isComponent,
  } = node

  // add dev annotations to patch flags
  let patchFlagString
  if (patchFlag) {
    if (__DEV__) {
      if (patchFlag < 0) {
        // special flags (negative and mutually exclusive)
        patchFlagString = patchFlag + ` /* ${PatchFlagNames[patchFlag]} */`
      } else {
        // bitwise flags
        const flagNames = Object.keys(PatchFlagNames)
          .map(Number)
          .filter(n => n > 0 && patchFlag & n)
          .map(n => PatchFlagNames[n as PatchFlags])
          .join(`, `)
        patchFlagString = patchFlag + ` /* ${flagNames} */`
      }
    } else {
      patchFlagString = String(patchFlag)
    }
  }

  if (directives) {
    push(helper(WITH_DIRECTIVES) + `(`)
  }
  if (isBlock) {
    push(`(${helper(OPEN_BLOCK)}(${disableTracking ? `true` : ``}), `)
  }
  if (pure) {
    push(PURE_ANNOTATION)
  }
  const callHelper: symbol = isBlock
    ? getVNodeBlockHelper(context.inSSR, isComponent)
    : getVNodeHelper(context.inSSR, isComponent)
  push(helper(callHelper) + `(`, NewlineType.None, node)
  genNodeList(
    genNullableArgs([tag, props, children, patchFlagString, dynamicProps]),
    context,
  )
  push(`)`)
  if (isBlock) {
    push(`)`)
  }
  if (directives) {
    push(`, `)
    genNode(directives, context)
    push(`)`)
  }
}

/**
 * 生成可空参数
 * @param args - 参数数组
 * @returns 处理后的参数数组
 */
function genNullableArgs(args: any[]): CallExpression['arguments'] {
  let i = args.length
  while (i--) {
    if (args[i] != null) break
  }
  return args.slice(0, i + 1).map(arg => arg || `null`)
}

// JavaScript 代码生成函数
/**
 * 生成调用表达式
 * @param node - 调用表达式节点
 * @param context - 代码生成上下文
 */
function genCallExpression(node: CallExpression, context: CodegenContext) {
  const { push, helper, pure } = context
  const callee = isString(node.callee) ? node.callee : helper(node.callee)
  if (pure) {
    push(PURE_ANNOTATION)
  }
  push(callee + `(`, NewlineType.None, node)
  genNodeList(node.arguments, context)
  push(`)`)
}

/**
 * 生成对象表达式
 * @param node - 对象表达式节点
 * @param context - 代码生成上下文
 */
function genObjectExpression(node: ObjectExpression, context: CodegenContext) {
  const { push, indent, deindent, newline } = context
  const { properties } = node
  if (!properties.length) {
    push(`{}`, NewlineType.None, node)
    return
  }
  const multilines =
    properties.length > 1 ||
    ((!__BROWSER__ || __DEV__) &&
      properties.some(p => p.value.type !== NodeTypes.SIMPLE_EXPRESSION))
  push(multilines ? `{` : `{ `)
  multilines && indent()
  for (let i = 0; i < properties.length; i++) {
    const { key, value } = properties[i]
    // key
    genExpressionAsPropertyKey(key, context)
    push(`: `)
    // value
    genNode(value, context)
    if (i < properties.length - 1) {
      // will only reach this if it's multilines
      push(`,`)
      newline()
    }
  }
  multilines && deindent()
  push(multilines ? `}` : ` }`)
}

/**
 * 生成数组表达式
 * @param node - 数组表达式节点
 * @param context - 代码生成上下文
 */
function genArrayExpression(node: ArrayExpression, context: CodegenContext) {
  genNodeListAsArray(node.elements as CodegenNode[], context)
}

/**
 * 生成函数表达式
 * @param node - 函数表达式节点
 * @param context - 代码生成上下文
 */
function genFunctionExpression(
  node: FunctionExpression,
  context: CodegenContext,
) {
  const { push, indent, deindent } = context
  const { params, returns, body, newline, isSlot } = node
  if (isSlot) {
    // wrap slot functions with owner context
    push(`_${helperNameMap[WITH_CTX]}(`)
  }
  push(`(`, NewlineType.None, node)
  if (isArray(params)) {
    genNodeList(params, context)
  } else if (params) {
    genNode(params, context)
  }
  push(`) => `)
  if (newline || body) {
    push(`{`)
    indent()
  }
  if (returns) {
    if (newline) {
      push(`return `)
    }
    if (isArray(returns)) {
      genNodeListAsArray(returns, context)
    } else {
      genNode(returns, context)
    }
  } else if (body) {
    genNode(body, context)
  }
  if (newline || body) {
    deindent()
    push(`}`)
  }
  if (isSlot) {
    if (__COMPAT__ && node.isNonScopedSlot) {
      push(`, undefined, true`)
    }
    push(`)`)
  }
}

/**
 * 生成条件表达式
 * @param node - 条件表达式节点
 * @param context - 代码生成上下文
 */
function genConditionalExpression(
  node: ConditionalExpression,
  context: CodegenContext,
) {
  const { test, consequent, alternate, newline: needNewline } = node
  const { push, indent, deindent, newline } = context
  if (test.type === NodeTypes.SIMPLE_EXPRESSION) {
    const needsParens = !isSimpleIdentifier(test.content)
    needsParens && push(`(`)
    genExpression(test, context)
    needsParens && push(`)`)
  } else {
    push(`(`)
    genNode(test, context)
    push(`)`)
  }
  needNewline && indent()
  context.indentLevel++
  needNewline || push(` `)
  push(`? `)
  genNode(consequent, context)
  context.indentLevel--
  needNewline && newline()
  needNewline || push(` `)
  push(`: `)
  const isNested = alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION
  if (!isNested) {
    context.indentLevel++
  }
  genNode(alternate, context)
  if (!isNested) {
    context.indentLevel--
  }
  needNewline && deindent(true /* without newline */)
}

/**
 * 生成缓存表达式
 * @param node - 缓存表达式节点
 * @param context - 代码生成上下文
 */
function genCacheExpression(node: CacheExpression, context: CodegenContext) {
  const { push, helper, indent, deindent, newline } = context
  const { needPauseTracking, needArraySpread } = node
  if (needArraySpread) {
    push(`[...(`)
  }
  push(`_cache[${node.index}] || (`)
  if (needPauseTracking) {
    indent()
    push(`${helper(SET_BLOCK_TRACKING)}(-1`)
    if (node.inVOnce) push(`, true`)
    push(`),`)
    newline()
    push(`(`)
  }
  push(`_cache[${node.index}] = `)
  genNode(node.value, context)
  if (needPauseTracking) {
    push(`).cacheIndex = ${node.index},`)
    newline()
    push(`${helper(SET_BLOCK_TRACKING)}(1),`)
    newline()
    push(`_cache[${node.index}]`)
    deindent()
  }
  push(`)`)
  if (needArraySpread) {
    push(`)]`)
  }
}

/**
 * 生成模板字面量
 * @param node - 模板字面量节点
 * @param context - 代码生成上下文
 */
function genTemplateLiteral(node: TemplateLiteral, context: CodegenContext) {
  const { push, indent, deindent } = context
  push('`')
  const l = node.elements.length
  const multilines = l > 3
  for (let i = 0; i < l; i++) {
    const e = node.elements[i]
    if (isString(e)) {
      push(e.replace(/(`|\$|\\)/g, '\\$1'), NewlineType.Unknown)
    } else {
      push('${')
      if (multilines) indent()
      genNode(e, context)
      if (multilines) deindent()
      push('}')
    }
  }
  push('`')
}

/**
 * 生成 if 语句
 * @param node - if 语句节点
 * @param context - 代码生成上下文
 */
function genIfStatement(node: IfStatement, context: CodegenContext) {
  const { push, indent, deindent } = context
  const { test, consequent, alternate } = node
  push(`if (`)
  genNode(test, context)
  push(`) {`)
  indent()
  genNode(consequent, context)
  deindent()
  push(`}`)
  if (alternate) {
    push(` else `)
    if (alternate.type === NodeTypes.JS_IF_STATEMENT) {
      genIfStatement(alternate, context)
    } else {
      push(`{`)
      indent()
      genNode(alternate, context)
      deindent()
      push(`}`)
    }
  }
}

/**
 * 生成赋值表达式
 * @param node - 赋值表达式节点
 * @param context - 代码生成上下文
 */
function genAssignmentExpression(
  node: AssignmentExpression,
  context: CodegenContext,
) {
  genNode(node.left, context)
  context.push(` = `)
  genNode(node.right, context)
}

/**
 * 生成序列表达式
 * @param node - 序列表达式节点
 * @param context - 代码生成上下文
 */
function genSequenceExpression(
  node: SequenceExpression,
  context: CodegenContext,
) {
  context.push(`(`)
  genNodeList(node.expressions, context)
  context.push(`)`)
}

/**
 * 生成返回语句
 * @param {Object} param - 参数对象
 * @param {CodegenNode | CodegenNode[]} param.returns - 返回的节点或节点数组
 * @param context - 代码生成上下文
 */
function genReturnStatement(
  { returns }: ReturnStatement,
  context: CodegenContext,
) {
  context.push(`return `)
  if (isArray(returns)) {
    genNodeListAsArray(returns, context)
  } else {
    genNode(returns, context)
  }
}
