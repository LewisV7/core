/**
 * Vue单文件组件(SFC)脚本编译模块
 * 负责处理Vue组件中的<script>和<script setup>部分
 * 包括解析、转换和生成最终可执行的JavaScript代码
 */
import {
  BindingTypes,
  UNREF,
  isFunctionType,
  unwrapTSNode,
  walkIdentifiers,
} from '@vue/compiler-dom'
import {
  DEFAULT_FILENAME,
  type SFCDescriptor,
  type SFCScriptBlock,
} from './parse'
import type { ParserPlugin } from '@babel/parser'
import { generateCodeFrame } from '@vue/shared'
import type {
  ArrayPattern,
  CallExpression,
  Declaration,
  ExportSpecifier,
  Identifier,
  LVal,
  Node,
  ObjectPattern,
  Statement,
} from '@babel/types'
import { walk } from 'estree-walker'
import {
  type RawSourceMap,
  SourceMapConsumer,
  SourceMapGenerator,
} from 'source-map-js'
import {
  normalScriptDefaultVar,
  processNormalScript,
} from './script/normalScript'
import { CSS_VARS_HELPER, genCssVarsCode } from './style/cssVars'
import {
  type SFCTemplateCompileOptions,
  compileTemplate,
} from './compileTemplate'
import { warnOnce } from './warn'
import { transformDestructuredProps } from './script/definePropsDestructure'
import { ScriptCompileContext } from './script/context'
import {
  DEFINE_PROPS,
  WITH_DEFAULTS,
  genRuntimeProps,
  processDefineProps,
} from './script/defineProps'
import {
  DEFINE_EMITS,
  genRuntimeEmits,
  processDefineEmits,
} from './script/defineEmits'
import { DEFINE_EXPOSE, processDefineExpose } from './script/defineExpose'
import { DEFINE_OPTIONS, processDefineOptions } from './script/defineOptions'
import { DEFINE_SLOTS, processDefineSlots } from './script/defineSlots'
import { DEFINE_MODEL, processDefineModel } from './script/defineModel'
import { getImportedName, isCallOf, isLiteralNode } from './script/utils'
import { analyzeScriptBindings } from './script/analyzeScriptBindings'
import { isImportUsed } from './script/importUsageCheck'
import { processAwait } from './script/topLevelAwait'

/**
 * 单文件组件脚本编译选项
 */
export interface SFCScriptCompileOptions {
  /**
   * Scope ID for prefixing injected CSS variables.
   * This must be consistent with the `id` passed to `compileStyle`.
   */
  id: string
  /**
   * Production mode. Used to determine whether to generate hashed CSS variables
   */
  isProd?: boolean
  /**
   * Enable/disable source map. Defaults to true.
   */
  sourceMap?: boolean
  /**
   * https://babeljs.io/docs/en/babel-parser#plugins
   */
  babelParserPlugins?: ParserPlugin[]
  /**
   * A list of files to parse for global types to be made available for type
   * resolving in SFC macros. The list must be fully resolved file system paths.
   */
  globalTypeFiles?: string[]
  /**
   * Compile the template and inline the resulting render function
   * directly inside setup().
   * - Only affects `<script setup>`
   * - This should only be used in production because it prevents the template
   * from being hot-reloaded separately from component state.
   */
  inlineTemplate?: boolean
  /**
   * Generate the final component as a variable instead of default export.
   * This is useful in e.g. @vitejs/plugin-vue where the script needs to be
   * placed inside the main module.
   */
  genDefaultAs?: string
  /**
   * Options for template compilation when inlining. Note these are options that
   * would normally be passed to `compiler-sfc`'s own `compileTemplate()`, not
   * options passed to `compiler-dom`.
   */
  templateOptions?: Partial<SFCTemplateCompileOptions>
  /**
   * Hoist <script setup> static constants.
   * - Only enables when one `<script setup>` exists.
   * @default true
   */
  hoistStatic?: boolean
  /**
   * Set to `false` to disable reactive destructure for `defineProps` (pre-3.5
   * behavior), or set to `'error'` to throw hard error on props destructures.
   * @default true
   */
  propsDestructure?: boolean | 'error'
  /**
   * File system access methods to be used when resolving types
   * imported in SFC macros. Defaults to ts.sys in Node.js, can be overwritten
   * to use a virtual file system for use in browsers (e.g. in REPLs)
   */
  fs?: {
    fileExists(file: string): boolean
    readFile(file: string): string | undefined
    realpath?(file: string): string
  }
  /**
   * Transform Vue SFCs into custom elements.
   */
  customElement?: boolean | ((filename: string) => boolean)
}

/**
 * 导入绑定信息
 * 描述从其他模块导入的符号及其绑定关系
 */
export interface ImportBinding {
  isType: boolean
  imported: string
  local: string
  source: string
  isFromSetup: boolean
  isUsedInTemplate: boolean
}

/**
 * Vue SFC支持的宏函数列表
 * 这些宏函数在<script setup>中具有特殊处理逻辑
 */
const MACROS = [
  DEFINE_PROPS,
  DEFINE_EMITS,
  DEFINE_EXPOSE,
  DEFINE_OPTIONS,
  DEFINE_SLOTS,
  DEFINE_MODEL,
  WITH_DEFAULTS,
]

/**
 * 编译Vue组件中的脚本部分
 * 支持普通<script>和<script setup>两种模式
 * 如果同时存在两种脚本，会进行合并处理
 * 
 * @param {SFCDescriptor} sfc - 单文件组件描述符
 * @param {SFCScriptCompileOptions} options - 编译选项
 * @returns {SFCScriptBlock} 编译后的脚本块
 */
export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions,
): SFCScriptBlock {
  // 检查是否提供了id选项，如果没有则发出警告
  if (!options.id) {
    warnOnce(
      `compileScript now requires passing the \`id\` option.\n` +
        `Upgrade your vite or vue-loader version for compatibility with ` +
        `the latest experimental proposals.`,
    )
  }

  // 创建脚本编译上下文，用于存储编译过程中的状态和工具
  const ctx = new ScriptCompileContext(sfc, options)
  // 从SFC描述符中提取必要的信息
  const { script, scriptSetup, source, filename } = sfc
  // 确定是否需要提升静态常量
  const hoistStatic = options.hoistStatic !== false && !script
  // 提取作用域ID（移除前缀data-v-）
  const scopeId = options.id ? options.id.replace(/^data-v-/, '') : ''
  // 获取普通<script>的语言类型
  const scriptLang = script && script.lang
  // 获取<script setup>的语言类型
  const scriptSetupLang = scriptSetup && scriptSetup.lang

  // 处理没有<script setup>的情况
  if (!scriptSetup) {
    // 如果既没有<script setup>也没有<script>，则抛出错误
      if (!script) {
      throw new Error(`[@vue/compiler-sfc] SFC contains no <script> tags.`)
    }
    // 只有普通<script>的情况
      // normal <script> only
    return processNormalScript(ctx, scopeId)
  }

  // 检查<script>和<script setup>的语言类型是否一致
  if (script && scriptLang !== scriptSetupLang) {
    throw new Error(
      `[@vue/compiler-sfc] <script> and <script setup> must have the same ` +
        `language type.`,
    )
  }

  // 处理非JS/TS脚本块的情况
  if (scriptSetupLang && !ctx.isJS && !ctx.isTS) {
    // do not process non js/ts script blocks
    return scriptSetup
  }

  // 初始化需要返回的元数据
  // metadata that needs to be returned
  // const ctx.bindingMetadata: BindingMetadata = {}
  const scriptBindings: Record<string, BindingTypes> = Object.create(null)
  const setupBindings: Record<string, BindingTypes> = Object.create(null)

  let defaultExport: Node | undefined
  let hasAwait = false
  let hasInlinedSsrRenderFn = false

  // string offsets
  const startOffset = ctx.startOffset!
  const endOffset = ctx.endOffset!
  const scriptStartOffset = script && script.loc.start.offset
  const scriptEndOffset = script && script.loc.end.offset

  /**
   * 将节点提升到模块顶部
   * @param {Statement} node - 要提升的AST语句节点
   */
  function hoistNode(node: Statement) {
    const start = node.start! + startOffset
    let end = node.end! + startOffset
    // locate comment
    if (node.trailingComments && node.trailingComments.length > 0) {
      const lastCommentNode =
        node.trailingComments[node.trailingComments.length - 1]
      end = lastCommentNode.end! + startOffset
    }
    // locate the end of whitespace between this statement and the next
    while (end <= source.length) {
      if (!/\s/.test(source.charAt(end))) {
        break
      }
      end++
    }
    ctx.s.move(start, end, 0)
  }

  /**
   * 注册用户导入的符号
   * @param {string} source - 导入源路径
   * @param {string} local - 本地变量名
   * @param {string} imported - 导入的符号名
   * @param {boolean} isType - 是否为类型导入
   * @param {boolean} isFromSetup - 是否来自<script setup>
   * @param {boolean} needTemplateUsageCheck - 是否需要检查模板使用情况
   */
  function registerUserImport(
    source: string,
    local: string,
    imported: string,
    isType: boolean,
    isFromSetup: boolean,
    needTemplateUsageCheck: boolean,
  ) {
    // template usage check is only needed in non-inline mode, so we can skip
    // the work if inlineTemplate is true.
    let isUsedInTemplate = needTemplateUsageCheck
    if (
      needTemplateUsageCheck &&
      ctx.isTS &&
      sfc.template &&
      !sfc.template.src &&
      !sfc.template.lang
    ) {
      isUsedInTemplate = isImportUsed(local, sfc)
    }

    ctx.userImports[local] = {
      isType,
      imported,
      local,
      source,
      isFromSetup,
      isUsedInTemplate,
    }
  }

  /**
   * 检查无效的作用域引用
   * 确保宏函数中不会引用局部声明的变量
   * @param {Node|undefined} node - 要检查的AST节点
   * @param {string} method - 宏函数名称
   */
  function checkInvalidScopeReference(node: Node | undefined, method: string) {
    if (!node) return
    walkIdentifiers(node, id => {
      const binding = setupBindings[id.name]
      if (binding && binding !== BindingTypes.LITERAL_CONST) {
        ctx.error(
          `\`${method}()\` in <script setup> cannot reference locally ` +
            `declared variables because it will be hoisted outside of the ` +
            `setup() function. If your component options require initialization ` +
            `in the module scope, use a separate normal <script> to export ` +
            `the options instead.`,
          id,
        )
      }
    })
  }

  const scriptAst = ctx.scriptAst
  const scriptSetupAst = ctx.scriptSetupAst!

  // 1.1 遍历<script>中的导入声明
  // 1.1 walk import declarations of <script>
  if (scriptAst) {
    for (const node of scriptAst.body) {
      if (node.type === 'ImportDeclaration') {
        // record imports for dedupe
        for (const specifier of node.specifiers) {
          const imported = getImportedName(specifier)
          registerUserImport(
            node.source.value,
            specifier.local.name,
            imported,
            node.importKind === 'type' ||
              (specifier.type === 'ImportSpecifier' &&
                specifier.importKind === 'type'),
            false,
            !options.inlineTemplate,
          )
        }
      }
    }
  }

  // 1.2 遍历<script setup>中的导入声明
  // 1.2 walk import declarations of <script setup>
  for (const node of scriptSetupAst.body) {
    if (node.type === 'ImportDeclaration') {
      // import declarations are moved to top
      hoistNode(node)

      // dedupe imports
      let removed = 0
      const removeSpecifier = (i: number) => {
        const removeLeft = i > removed
        removed++
        const current = node.specifiers[i]
        const next = node.specifiers[i + 1]
        ctx.s.remove(
          removeLeft
            ? node.specifiers[i - 1].end! + startOffset
            : current.start! + startOffset,
          next && !removeLeft
            ? next.start! + startOffset
            : current.end! + startOffset,
        )
      }

      for (let i = 0; i < node.specifiers.length; i++) {
        const specifier = node.specifiers[i]
        const local = specifier.local.name
        const imported = getImportedName(specifier)
        const source = node.source.value
        const existing = ctx.userImports[local]
        if (source === 'vue' && MACROS.includes(imported)) {
          if (local === imported) {
            warnOnce(
              `\`${imported}\` is a compiler macro and no longer needs to be imported.`,
            )
          } else {
            ctx.error(
              `\`${imported}\` is a compiler macro and cannot be aliased to ` +
                `a different name.`,
              specifier,
            )
          }
          removeSpecifier(i)
        } else if (existing) {
          if (existing.source === source && existing.imported === imported) {
            // already imported in <script setup>, dedupe
            removeSpecifier(i)
          } else {
            ctx.error(
              `different imports aliased to same local name.`,
              specifier,
            )
          }
        } else {
          registerUserImport(
            source,
            local,
            imported,
            node.importKind === 'type' ||
              (specifier.type === 'ImportSpecifier' &&
                specifier.importKind === 'type'),
            true,
            !options.inlineTemplate,
          )
        }
      }
      if (node.specifiers.length && removed === node.specifiers.length) {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      }
    }
  }

  // 1.3 解析用户可能导入的`ref`和`reactive`等API的别名
  // 1.3 resolve possible user import alias of `ref` and `reactive`
  const vueImportAliases: Record<string, string> = {}
  for (const key in ctx.userImports) {
    const { source, imported, local } = ctx.userImports[key]
    if (source === 'vue') vueImportAliases[imported] = local
  }

  // 2.1 处理普通<script>的主体内容
  // 2.1 process normal <script> body
  if (script && scriptAst) {
    for (const node of scriptAst.body) {
      if (node.type === 'ExportDefaultDeclaration') {
        // 处理默认导出
          // export default
        defaultExport = node

        // 检查用户是否手动指定了`name`或'render`选项
          // check if user has manually specified `name` or 'render` option in
        // export default
        // if has name, skip name inference
        // if has render and no template, generate return object instead of
        // empty render function (#4980)
        let optionProperties
        if (defaultExport.declaration.type === 'ObjectExpression') {
          optionProperties = defaultExport.declaration.properties
        } else if (
          defaultExport.declaration.type === 'CallExpression' &&
          defaultExport.declaration.arguments[0] &&
          defaultExport.declaration.arguments[0].type === 'ObjectExpression'
        ) {
          optionProperties = defaultExport.declaration.arguments[0].properties
        }
        if (optionProperties) {
          for (const p of optionProperties) {
            if (
              p.type === 'ObjectProperty' &&
              p.key.type === 'Identifier' &&
              p.key.name === 'name'
            ) {
              ctx.hasDefaultExportName = true
            }
            if (
              (p.type === 'ObjectMethod' || p.type === 'ObjectProperty') &&
              p.key.type === 'Identifier' &&
              p.key.name === 'render'
            ) {
              // TODO warn when we provide a better way to do it?
              ctx.hasDefaultExportRender = true
            }
          }
        }

        // export default { ... } --> const __default__ = { ... }
        const start = node.start! + scriptStartOffset!
        const end = node.declaration.start! + scriptStartOffset!
        ctx.s.overwrite(start, end, `const ${normalScriptDefaultVar} = `)
      } else if (node.type === 'ExportNamedDeclaration') {
        const defaultSpecifier = node.specifiers.find(
          s =>
            s.exported.type === 'Identifier' && s.exported.name === 'default',
        ) as ExportSpecifier
        if (defaultSpecifier) {
          defaultExport = node
          // 1. 移除导出指定符
          // 1. remove specifier
          if (node.specifiers.length > 1) {
            ctx.s.remove(
              defaultSpecifier.start! + scriptStartOffset!,
              defaultSpecifier.end! + scriptStartOffset!,
            )
          } else {
            ctx.s.remove(
              node.start! + scriptStartOffset!,
              node.end! + scriptStartOffset!,
            )
          }
          if (node.source) {
            // 处理从其他模块导出默认值的情况
            // export { x as default } from './x'
            // rewrite to `import { x as __default__ } from './x'` and
            // add to top
            ctx.s.prepend(
              `import { ${defaultSpecifier.local.name} as ${normalScriptDefaultVar} } from '${node.source.value}'\n`,
            )
          } else {
            // export { x as default }
            // rewrite to `const __default__ = x` and move to end
            ctx.s.appendLeft(
              scriptEndOffset!,
              `\nconst ${normalScriptDefaultVar} = ${defaultSpecifier.local.name}\n`,
            )
          }
        }
        if (node.declaration) {
          walkDeclaration(
            'script',
            node.declaration,
            scriptBindings,
            vueImportAliases,
            hoistStatic,
          )
        }
      } else if (
        (node.type === 'VariableDeclaration' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'ClassDeclaration' ||
          node.type === 'TSEnumDeclaration') &&
        !node.declare
      ) {
        walkDeclaration(
          'script',
          node,
          scriptBindings,
          vueImportAliases,
          hoistStatic,
        )
      }
    }

    // 处理<script>在<script setup>之后的情况
    // <script> after <script setup>
    // we need to move the block up so that `const __default__` is
    // declared before being used in the actual component definition
    if (scriptStartOffset! > startOffset) {
      // if content doesn't end with newline, add one
      if (!/\n$/.test(script.content.trim())) {
        ctx.s.appendLeft(scriptEndOffset!, `\n`)
      }
      ctx.s.move(scriptStartOffset!, scriptEndOffset!, 0)
    }
  }

  // 2.2 处理<script setup>的主体内容
  // 2.2 process <script setup> body
  for (const node of scriptSetupAst.body) {
    if (node.type === 'ExpressionStatement') {
      const expr = unwrapTSNode(node.expression)
      // 处理`defineProps`和`defineEmit(s)`调用
      // process `defineProps` and `defineEmit(s)` calls
      if (
        processDefineProps(ctx, expr) ||
        processDefineEmits(ctx, expr) ||
        processDefineOptions(ctx, expr) ||
        processDefineSlots(ctx, expr)
      ) {
        ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
      } else if (processDefineExpose(ctx, expr)) {
        // defineExpose({}) -> expose({})
        const callee = (expr as CallExpression).callee
        ctx.s.overwrite(
          callee.start! + startOffset,
          callee.end! + startOffset,
          '__expose',
        )
      } else {
        processDefineModel(ctx, expr)
      }
    }

    if (node.type === 'VariableDeclaration' && !node.declare) {
      const total = node.declarations.length
      let left = total
      let lastNonRemoved: number | undefined

      for (let i = 0; i < total; i++) {
        const decl = node.declarations[i]
        const init = decl.init && unwrapTSNode(decl.init)
        if (init) {
          if (processDefineOptions(ctx, init)) {
            ctx.error(
              `${DEFINE_OPTIONS}() has no returning value, it cannot be assigned.`,
              node,
            )
          }

          // defineProps
          const isDefineProps = processDefineProps(ctx, init, decl.id as LVal)
          if (ctx.propsDestructureRestId) {
            setupBindings[ctx.propsDestructureRestId] =
              BindingTypes.SETUP_REACTIVE_CONST
          }

          // defineEmits
          const isDefineEmits =
            !isDefineProps && processDefineEmits(ctx, init, decl.id as LVal)
          !isDefineEmits &&
            (processDefineSlots(ctx, init, decl.id as LVal) ||
              processDefineModel(ctx, init, decl.id as LVal))

          if (
            isDefineProps &&
            !ctx.propsDestructureRestId &&
            ctx.propsDestructureDecl
          ) {
            if (left === 1) {
              ctx.s.remove(node.start! + startOffset, node.end! + startOffset)
            } else {
              let start = decl.start! + startOffset
              let end = decl.end! + startOffset
              if (i === total - 1) {
                // last one, locate the end of the last one that is not removed
                // if we arrive at this branch, there must have been a
                // non-removed decl before us, so lastNonRemoved is non-null.
                start = node.declarations[lastNonRemoved!].end! + startOffset
              } else {
                // not the last one, locate the start of the next
                end = node.declarations[i + 1].start! + startOffset
              }
              ctx.s.remove(start, end)
              left--
            }
          } else if (isDefineEmits) {
            ctx.s.overwrite(
              startOffset + init.start!,
              startOffset + init.end!,
              '__emit',
            )
          } else {
            lastNonRemoved = i
          }
        }
      }
    }

    let isAllLiteral = false
    // walk declarations to record declared bindings
    if (
      (node.type === 'VariableDeclaration' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration' ||
        node.type === 'TSEnumDeclaration') &&
      !node.declare
    ) {
      isAllLiteral = walkDeclaration(
        'scriptSetup',
        node,
        setupBindings,
        vueImportAliases,
        hoistStatic,
        !!ctx.propsDestructureDecl,
      )
    }

    // hoist literal constants
    if (hoistStatic && isAllLiteral) {
      hoistNode(node)
    }

    // walk statements & named exports / variable declarations for top level
    // await
    if (
      (node.type === 'VariableDeclaration' && !node.declare) ||
      node.type.endsWith('Statement')
    ) {
      const scope: Statement[][] = [scriptSetupAst.body]
      walk(node, {
        enter(child: Node, parent: Node | null) {
          if (isFunctionType(child)) {
            this.skip()
          }
          if (child.type === 'BlockStatement') {
            scope.push(child.body)
          }
          if (child.type === 'AwaitExpression') {
            hasAwait = true
            // if the await expression is an expression statement and
            // - is in the root scope
            // - or is not the first statement in a nested block scope
            // then it needs a semicolon before the generated code.
            const currentScope = scope[scope.length - 1]
            const needsSemi = currentScope.some((n, i) => {
              return (
                (scope.length === 1 || i > 0) &&
                n.type === 'ExpressionStatement' &&
                n.start === child.start
              )
            })
            processAwait(
              ctx,
              child,
              needsSemi,
              parent!.type === 'ExpressionStatement',
            )
          }
        },
        exit(node: Node) {
          if (node.type === 'BlockStatement') scope.pop()
        },
      })
    }

    if (
      (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      ctx.error(
        `<script setup> cannot contain ES module exports. ` +
          `If you are using a previous version of <script setup>, please ` +
          `consult the updated RFC at https://github.com/vuejs/rfcs/pull/227.`,
        node,
      )
    }

    if (ctx.isTS) {
      // move all Type declarations to outer scope
      if (
        node.type.startsWith('TS') ||
        (node.type === 'ExportNamedDeclaration' &&
          node.exportKind === 'type') ||
        (node.type === 'VariableDeclaration' && node.declare)
      ) {
        if (node.type !== 'TSEnumDeclaration') {
          hoistNode(node)
        }
      }
    }
  }

  // 3. 处理props解构转换
  // 3 props destructure transform
  if (ctx.propsDestructureDecl) {
    transformDestructuredProps(ctx, vueImportAliases)
  }

  // 4. 检查宏参数是否引用了setup作用域变量
  // 4. check macro args to make sure it doesn't reference setup scope
  // variables
  checkInvalidScopeReference(ctx.propsRuntimeDecl, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.propsRuntimeDefaults, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.propsDestructureDecl, DEFINE_PROPS)
  checkInvalidScopeReference(ctx.emitsRuntimeDecl, DEFINE_EMITS)
  checkInvalidScopeReference(ctx.optionsRuntimeDecl, DEFINE_OPTIONS)
  for (const { runtimeOptionNodes } of Object.values(ctx.modelDecls)) {
    for (const node of runtimeOptionNodes) {
      checkInvalidScopeReference(node, DEFINE_MODEL)
    }
  }

  // 5. 移除非脚本内容
  // 5. remove non-script content
  if (script) {
    if (startOffset < scriptStartOffset!) {
      // <script setup> before <script>
      ctx.s.remove(0, startOffset)
      ctx.s.remove(endOffset, scriptStartOffset!)
      ctx.s.remove(scriptEndOffset!, source.length)
    } else {
      // <script> before <script setup>
      ctx.s.remove(0, scriptStartOffset!)
      ctx.s.remove(scriptEndOffset!, startOffset)
      ctx.s.remove(endOffset, source.length)
    }
  } else {
    // only <script setup>
    ctx.s.remove(0, startOffset)
    ctx.s.remove(endOffset, source.length)
  }

  // 6. 分析绑定元数据
  // 6. analyze binding metadata
  // `defineProps`和`defineModel`也会注册props绑定
    // `defineProps` & `defineModel` also register props bindings
  if (scriptAst) {
    Object.assign(ctx.bindingMetadata, analyzeScriptBindings(scriptAst.body))
  }
  for (const [key, { isType, imported, source }] of Object.entries(
    ctx.userImports,
  )) {
    if (isType) continue
    ctx.bindingMetadata[key] =
      imported === '*' ||
      (imported === 'default' && source.endsWith('.vue')) ||
      source === 'vue'
        ? BindingTypes.SETUP_CONST
        : BindingTypes.SETUP_MAYBE_REF
  }
  for (const key in scriptBindings) {
    ctx.bindingMetadata[key] = scriptBindings[key]
  }
  for (const key in setupBindings) {
    ctx.bindingMetadata[key] = setupBindings[key]
  }

  // 7. 注入CSS变量使用调用
  // 7. inject `useCssVars` calls
  if (
    sfc.cssVars.length &&
    // no need to do this when targeting SSR
    !options.templateOptions?.ssr
  ) {
    ctx.helperImports.add(CSS_VARS_HELPER)
    ctx.helperImports.add('unref')
    ctx.s.prependLeft(
      startOffset,
      `\n${genCssVarsCode(
        sfc.cssVars,
        ctx.bindingMetadata,
        scopeId,
        !!options.isProd,
      )}\n`,
    )
  }

  // 8. 最终确定setup()参数签名
  // 8. finalize setup() argument signature
  let args = `__props`
  if (ctx.propsTypeDecl) {
    // mark as any and only cast on assignment
    // since the user defined complex types may be incompatible with the
    // inferred type from generated runtime declarations
    args += `: any`
  }
  // 注入用户对props的赋值
  // inject user assignment of props
  // we use a default __props so that template expressions referencing props
  // can use it directly
  if (ctx.propsDecl) {
    if (ctx.propsDestructureRestId) {
      ctx.s.overwrite(
        startOffset + ctx.propsCall!.start!,
        startOffset + ctx.propsCall!.end!,
        `${ctx.helper(`createPropsRestProxy`)}(__props, ${JSON.stringify(
          Object.keys(ctx.propsDestructuredBindings),
        )})`,
      )
      ctx.s.overwrite(
        startOffset + ctx.propsDestructureDecl!.start!,
        startOffset + ctx.propsDestructureDecl!.end!,
        ctx.propsDestructureRestId,
      )
    } else if (!ctx.propsDestructureDecl) {
      ctx.s.overwrite(
        startOffset + ctx.propsCall!.start!,
        startOffset + ctx.propsCall!.end!,
        '__props',
      )
    }
  }

  // 注入用于保存异步上下文的临时变量
  // inject temp variables for async context preservation
  if (hasAwait) {
    const any = ctx.isTS ? `: any` : ``
    ctx.s.prependLeft(startOffset, `\nlet __temp${any}, __restore${any}\n`)
  }

  const destructureElements =
    ctx.hasDefineExposeCall || !options.inlineTemplate
      ? [`expose: __expose`]
      : []
  if (ctx.emitDecl) {
    destructureElements.push(`emit: __emit`)
  }
  if (destructureElements.length) {
    args += `, { ${destructureElements.join(', ')} }`
  }

  let templateMap
  // 9. 生成返回语句
  // 9. generate return statement
  let returned
  if (
    !options.inlineTemplate ||
    (!sfc.template && ctx.hasDefaultExportRender)
  ) {
    // 非内联模式，或在普通<script>中有手动渲染
    // non-inline mode, or has manual render in normal <script>
    // return bindings from script and script setup
    const allBindings: Record<string, any> = {
      ...scriptBindings,
      ...setupBindings,
    }
    for (const key in ctx.userImports) {
      if (
        !ctx.userImports[key].isType &&
        ctx.userImports[key].isUsedInTemplate
      ) {
        allBindings[key] = true
      }
    }
    returned = `{ `
    for (const key in allBindings) {
      if (
        allBindings[key] === true &&
        ctx.userImports[key].source !== 'vue' &&
        !ctx.userImports[key].source.endsWith('.vue')
      ) {
        // generate getter for import bindings
        // skip vue imports since we know they will never change
        returned += `get ${key}() { return ${key} }, `
      } else if (ctx.bindingMetadata[key] === BindingTypes.SETUP_LET) {
        // local let binding, also add setter
        const setArg = key === 'v' ? `_v` : `v`
        returned +=
          `get ${key}() { return ${key} }, ` +
          `set ${key}(${setArg}) { ${key} = ${setArg} }, `
      } else {
        returned += `${key}, `
      }
    }
    returned = returned.replace(/, $/, '') + ` }`
  } else {
    // inline mode
    if (sfc.template && !sfc.template.src) {
      if (options.templateOptions && options.templateOptions.ssr) {
        hasInlinedSsrRenderFn = true
      }
      // 内联渲染函数模式 - 我们将在此处编译并内联模板
    // inline render function mode - we are going to compile the template and
      // inline it right here
      const { code, ast, preamble, tips, errors, map } = compileTemplate({
        filename,
        ast: sfc.template.ast,
        source: sfc.template.content,
        inMap: sfc.template.map,
        ...options.templateOptions,
        id: scopeId,
        scoped: sfc.styles.some(s => s.scoped),
        isProd: options.isProd,
        ssrCssVars: sfc.cssVars,
        compilerOptions: {
          ...(options.templateOptions &&
            options.templateOptions.compilerOptions),
          inline: true,
          isTS: ctx.isTS,
          bindingMetadata: ctx.bindingMetadata,
        },
      })
      templateMap = map
      if (tips.length) {
        tips.forEach(warnOnce)
      }
      const err = errors[0]
      if (typeof err === 'string') {
        throw new Error(err)
      } else if (err) {
        if (err.loc) {
          err.message +=
            `\n\n` +
            sfc.filename +
            '\n' +
            generateCodeFrame(
              source,
              err.loc.start.offset,
              err.loc.end.offset,
            ) +
            `\n`
        }
        throw err
      }
      if (preamble) {
        ctx.s.prepend(preamble)
      }
      // avoid duplicated unref import
      // as this may get injected by the render function preamble OR the
      // css vars codegen
      if (ast && ast.helpers.has(UNREF)) {
        ctx.helperImports.delete('unref')
      }
      returned = code
    } else {
      returned = `() => {}`
    }
  }

  if (!options.inlineTemplate && !__TEST__) {
    // in non-inline mode, the `__isScriptSetup: true` flag is used by
    // componentPublicInstance proxy to allow properties that start with $ or _
    ctx.s.appendRight(
      endOffset,
      `\nconst __returned__ = ${returned}\n` +
        `Object.defineProperty(__returned__, '__isScriptSetup', { enumerable: false, value: true })\n` +
        `return __returned__` +
        `\n}\n\n`,
    )
  } else {
    ctx.s.appendRight(endOffset, `\nreturn ${returned}\n}\n\n`)
  }

  // 10. 最终处理默认导出
  // 10. finalize default export
  const genDefaultAs = options.genDefaultAs
    ? `const ${options.genDefaultAs} =`
    : `export default`

  let runtimeOptions = ``
  if (!ctx.hasDefaultExportName && filename && filename !== DEFAULT_FILENAME) {
    const match = filename.match(/([^/\\]+)\.\w+$/)
    if (match) {
      runtimeOptions += `\n  __name: '${match[1]}',`
    }
  }
  if (hasInlinedSsrRenderFn) {
    runtimeOptions += `\n  __ssrInlineRender: true,`
  }

  const propsDecl = genRuntimeProps(ctx)
  if (propsDecl) runtimeOptions += `\n  props: ${propsDecl},`

  const emitsDecl = genRuntimeEmits(ctx)
  if (emitsDecl) runtimeOptions += `\n  emits: ${emitsDecl},`

  let definedOptions = ''
  if (ctx.optionsRuntimeDecl) {
    definedOptions = scriptSetup.content
      .slice(ctx.optionsRuntimeDecl.start!, ctx.optionsRuntimeDecl.end!)
      .trim()
  }

  // <script setup> components are closed by default. If the user did not
  // explicitly call `defineExpose`, call expose() with no args.
  const exposeCall =
    ctx.hasDefineExposeCall || options.inlineTemplate ? `` : `  __expose();\n`
  // wrap setup code with function.
  if (ctx.isTS) {
    // for TS, make sure the exported type is still valid type with
    // correct props information
    // we have to use object spread for types to be merged properly
    // user's TS setting should compile it down to proper targets
    // export default defineComponent({ ...__default__, ... })
    const def =
      (defaultExport ? `\n  ...${normalScriptDefaultVar},` : ``) +
      (definedOptions ? `\n  ...${definedOptions},` : '')
    ctx.s.prependLeft(
      startOffset,
      `\n${genDefaultAs} /*@__PURE__*/${ctx.helper(
        `defineComponent`,
      )}({${def}${runtimeOptions}\n  ${
        hasAwait ? `async ` : ``
      }setup(${args}) {\n${exposeCall}`,
    )
    ctx.s.appendRight(endOffset, `})`)
  } else {
    if (defaultExport || definedOptions) {
      // without TS, can't rely on rest spread, so we use Object.assign
      // export default Object.assign(__default__, { ... })
      ctx.s.prependLeft(
        startOffset,
        `\n${genDefaultAs} /*@__PURE__*/Object.assign(${
          defaultExport ? `${normalScriptDefaultVar}, ` : ''
        }${definedOptions ? `${definedOptions}, ` : ''}{${runtimeOptions}\n  ` +
          `${hasAwait ? `async ` : ``}setup(${args}) {\n${exposeCall}`,
      )
      ctx.s.appendRight(endOffset, `})`)
    } else {
      ctx.s.prependLeft(
        startOffset,
        `\n${genDefaultAs} {${runtimeOptions}\n  ` +
          `${hasAwait ? `async ` : ``}setup(${args}) {\n${exposeCall}`,
      )
      ctx.s.appendRight(endOffset, `}`)
    }
  }

  // 11. 最终处理Vue辅助工具导入
  // 11. finalize Vue helper imports
  if (ctx.helperImports.size > 0) {
    const runtimeModuleName =
      options.templateOptions?.compilerOptions?.runtimeModuleName
    const importSrc = runtimeModuleName
      ? JSON.stringify(runtimeModuleName)
      : `'vue'`
    ctx.s.prepend(
      `import { ${[...ctx.helperImports]
        .map(h => `${h} as _${h}`)
        .join(', ')} } from ${importSrc}\n`,
    )
  }

  const content = ctx.s.toString()
  let map =
    options.sourceMap !== false
      ? (ctx.s.generateMap({
          source: filename,
          hires: true,
          includeContent: true,
        }) as unknown as RawSourceMap)
      : undefined
  // merge source maps of the script setup and template in inline mode
  if (templateMap && map) {
    const offset = content.indexOf(returned)
    const templateLineOffset =
      content.slice(0, offset).split(/\r?\n/).length - 1
    map = mergeSourceMaps(map, templateMap, templateLineOffset)
  }
  return {
    ...scriptSetup,
    bindings: ctx.bindingMetadata,
    imports: ctx.userImports,
    content,
    map,
    scriptAst: scriptAst?.body,
    scriptSetupAst: scriptSetupAst?.body,
    deps: ctx.deps ? [...ctx.deps] : undefined,
  }
}

/**
 * 注册绑定变量
 * @param bindings 绑定记录对象
 * @param node 标识符节点
 * @param type 绑定类型
 */
function registerBinding(
  bindings: Record<string, BindingTypes>,
  node: Identifier,
  type: BindingTypes,
) {
  bindings[node.name] = type
}

/**
 * 遍历声明节点并处理绑定
 * @param from 来源('script'或'scriptSetup')
 * @param node 声明节点
 * @param bindings 绑定记录对象
 * @param userImportAliases 用户导入别名
 * @param hoistStatic 是否提升静态变量
 * @param isPropsDestructureEnabled 是否启用props解构
 * @returns 是否所有声明都是字面量常量
 */
function walkDeclaration(
  from: 'script' | 'scriptSetup',
  node: Declaration,
  bindings: Record<string, BindingTypes>,
  userImportAliases: Record<string, string>,
  hoistStatic: boolean,
  isPropsDestructureEnabled = false,
): boolean {
  let isAllLiteral = false

  if (node.type === 'VariableDeclaration') {
    const isConst = node.kind === 'const'
    isAllLiteral =
      isConst &&
      node.declarations.every(
        decl => decl.id.type === 'Identifier' && isStaticNode(decl.init!),
      )

    // export const foo = ...
    for (const { id, init: _init } of node.declarations) {
      const init = _init && unwrapTSNode(_init)
      const isConstMacroCall =
        isConst &&
        isCallOf(
          init,
          c =>
            c === DEFINE_PROPS ||
            c === DEFINE_EMITS ||
            c === WITH_DEFAULTS ||
            c === DEFINE_SLOTS,
        )
      if (id.type === 'Identifier') {
        let bindingType
        const userReactiveBinding = userImportAliases['reactive']
        if (
          (hoistStatic || from === 'script') &&
          (isAllLiteral || (isConst && isStaticNode(init!)))
        ) {
          bindingType = BindingTypes.LITERAL_CONST
        } else if (isCallOf(init, userReactiveBinding)) {
          // treat reactive() calls as let since it's meant to be mutable
          bindingType = isConst
            ? BindingTypes.SETUP_REACTIVE_CONST
            : BindingTypes.SETUP_LET
        } else if (
          // if a declaration is a const literal, we can mark it so that
          // the generated render fn code doesn't need to unref() it
          isConstMacroCall ||
          (isConst && canNeverBeRef(init!, userReactiveBinding))
        ) {
          bindingType = isCallOf(init, DEFINE_PROPS)
            ? BindingTypes.SETUP_REACTIVE_CONST
            : BindingTypes.SETUP_CONST
        } else if (isConst) {
          if (
            isCallOf(
              init,
              m =>
                m === userImportAliases['ref'] ||
                m === userImportAliases['computed'] ||
                m === userImportAliases['shallowRef'] ||
                m === userImportAliases['customRef'] ||
                m === userImportAliases['toRef'] ||
                m === userImportAliases['useTemplateRef'] ||
                m === DEFINE_MODEL,
            )
          ) {
            bindingType = BindingTypes.SETUP_REF
          } else {
            bindingType = BindingTypes.SETUP_MAYBE_REF
          }
        } else {
          bindingType = BindingTypes.SETUP_LET
        }
        registerBinding(bindings, id, bindingType)
      } else {
        if (isCallOf(init, DEFINE_PROPS) && isPropsDestructureEnabled) {
          continue
        }
        if (id.type === 'ObjectPattern') {
          walkObjectPattern(id, bindings, isConst, isConstMacroCall)
        } else if (id.type === 'ArrayPattern') {
          walkArrayPattern(id, bindings, isConst, isConstMacroCall)
        }
      }
    }
  } else if (node.type === 'TSEnumDeclaration') {
    isAllLiteral = node.members.every(
      member => !member.initializer || isStaticNode(member.initializer),
    )
    bindings[node.id!.name] = isAllLiteral
      ? BindingTypes.LITERAL_CONST
      : BindingTypes.SETUP_CONST
  } else if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration'
  ) {
    // export function foo() {} / export class Foo {}
    // export declarations must be named.
    bindings[node.id!.name] = BindingTypes.SETUP_CONST
  }

  return isAllLiteral
}

/**
 * 遍历对象模式并处理绑定
 * @param node 对象模式节点
 * @param bindings 绑定记录对象
 * @param isConst 是否为常量
 * @param isDefineCall 是否为defineProps/defineEmits调用
 */
function walkObjectPattern(
  node: ObjectPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false,
) {
  for (const p of node.properties) {
    if (p.type === 'ObjectProperty') {
      if (p.key.type === 'Identifier' && p.key === p.value) {
        // shorthand: const { x } = ...
        const type = isDefineCall
          ? BindingTypes.SETUP_CONST
          : isConst
            ? BindingTypes.SETUP_MAYBE_REF
            : BindingTypes.SETUP_LET
        registerBinding(bindings, p.key, type)
      } else {
        walkPattern(p.value, bindings, isConst, isDefineCall)
      }
    } else {
      // ...rest
      // argument can only be identifier when destructuring
      const type = isConst ? BindingTypes.SETUP_CONST : BindingTypes.SETUP_LET
      registerBinding(bindings, p.argument as Identifier, type)
    }
  }
}

/**
 * 遍历数组模式并处理绑定
 * @param node 数组模式节点
 * @param bindings 绑定记录对象
 * @param isConst 是否为常量
 * @param isDefineCall 是否为defineProps/defineEmits调用
 */
function walkArrayPattern(
  node: ArrayPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false,
) {
  for (const e of node.elements) {
    e && walkPattern(e, bindings, isConst, isDefineCall)
  }
}

/**
 * 遍历模式节点并处理绑定
 * @param node 模式节点
 * @param bindings 绑定记录对象
 * @param isConst 是否为常量
 * @param isDefineCall 是否为defineProps/defineEmits调用
 */
function walkPattern(
  node: Node,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isDefineCall = false,
) {
  if (node.type === 'Identifier') {
    const type = isDefineCall
      ? BindingTypes.SETUP_CONST
      : isConst
        ? BindingTypes.SETUP_MAYBE_REF
        : BindingTypes.SETUP_LET
    registerBinding(bindings, node, type)
  } else if (node.type === 'RestElement') {
    // argument can only be identifier when destructuring
    const type = isConst ? BindingTypes.SETUP_CONST : BindingTypes.SETUP_LET
    registerBinding(bindings, node.argument as Identifier, type)
  } else if (node.type === 'ObjectPattern') {
    walkObjectPattern(node, bindings, isConst)
  } else if (node.type === 'ArrayPattern') {
    walkArrayPattern(node, bindings, isConst)
  } else if (node.type === 'AssignmentPattern') {
    if (node.left.type === 'Identifier') {
      const type = isDefineCall
        ? BindingTypes.SETUP_CONST
        : isConst
          ? BindingTypes.SETUP_MAYBE_REF
          : BindingTypes.SETUP_LET
      registerBinding(bindings, node.left, type)
    } else {
      walkPattern(node.left, bindings, isConst)
    }
  }
}

/**
 * 检查节点是否永远不会是ref
 * @param node 节点
 * @param userReactiveImport 用户导入的reactive函数别名
 * @returns 是否永远不会是ref
 */
function canNeverBeRef(node: Node, userReactiveImport?: string): boolean {
  if (isCallOf(node, userReactiveImport)) {
    return true
  }
  switch (node.type) {
    case 'UnaryExpression':
    case 'BinaryExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'UpdateExpression':
    case 'ClassExpression':
    case 'TaggedTemplateExpression':
      return true
    case 'SequenceExpression':
      return canNeverBeRef(
        node.expressions[node.expressions.length - 1],
        userReactiveImport,
      )
    default:
      if (isLiteralNode(node)) {
        return true
      }
      return false
  }
}

/**
 * 检查节点是否为静态节点
 * @param node 节点
 * @returns 是否为静态节点
 */
function isStaticNode(node: Node): boolean {
  node = unwrapTSNode(node)

  switch (node.type) {
    case 'UnaryExpression': // void 0, !true
      return isStaticNode(node.argument)

    case 'LogicalExpression': // 1 > 2
    case 'BinaryExpression': // 1 + 2
      return isStaticNode(node.left) && isStaticNode(node.right)

    case 'ConditionalExpression': {
      // 1 ? 2 : 3
      return (
        isStaticNode(node.test) &&
        isStaticNode(node.consequent) &&
        isStaticNode(node.alternate)
      )
    }

    case 'SequenceExpression': // (1, 2)
    case 'TemplateLiteral': // `foo${1}`
      return node.expressions.every(expr => isStaticNode(expr))

    case 'ParenthesizedExpression': // (1)
      return isStaticNode(node.expression)

    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'BigIntLiteral':
      return true
  }
  return false
}

/**
 * 合并源码映射
 * @param scriptMap 脚本源码映射
 * @param templateMap 模板源码映射
 * @param templateLineOffset 模板行偏移量
 * @returns 合并后的源码映射
 */
export function mergeSourceMaps(
  scriptMap: RawSourceMap,
  templateMap: RawSourceMap,
  templateLineOffset: number,
): RawSourceMap {
  const generator = new SourceMapGenerator()
  const addMapping = (map: RawSourceMap, lineOffset = 0) => {
    const consumer = new SourceMapConsumer(map)
    ;(consumer as any).sources.forEach((sourceFile: string) => {
      ;(generator as any)._sources.add(sourceFile)
      const sourceContent = consumer.sourceContentFor(sourceFile)
      if (sourceContent != null) {
        generator.setSourceContent(sourceFile, sourceContent)
      }
    })
    consumer.eachMapping(m => {
      if (m.originalLine == null) return
      generator.addMapping({
        generated: {
          line: m.generatedLine + lineOffset,
          column: m.generatedColumn,
        },
        original: {
          line: m.originalLine,
          column: m.originalColumn!,
        },
        source: m.source,
        name: m.name,
      })
    })
  }

  addMapping(scriptMap)
  addMapping(templateMap, templateLineOffset)
  ;(generator as any)._sourceRoot = scriptMap.sourceRoot
  ;(generator as any)._file = scriptMap.file
  return (generator as any).toJSON()
}
