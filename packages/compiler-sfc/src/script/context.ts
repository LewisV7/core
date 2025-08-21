/*
 * Vue单文件组件脚本编译上下文
 * 负责处理SFC中的脚本部分，包括解析、转换和代码生成
 * 提供了处理defineProps、defineEmits等宏的功能
 */
import type { CallExpression, Node, ObjectPattern, Program } from '@babel/types'
import type { SFCDescriptor } from '../parse'
import { generateCodeFrame, isArray } from '@vue/shared'
import { type ParserPlugin, parse as babelParse } from '@babel/parser'
import type { ImportBinding, SFCScriptCompileOptions } from '../compileScript'
import type { PropsDestructureBindings } from './defineProps'
import type { ModelDecl } from './defineModel'
import type { BindingMetadata } from '../../../compiler-core/src'
import MagicString from 'magic-string'
import type { TypeScope } from './resolveType'
import { warn } from '../warn'

/**
 * 脚本编译上下文类
 * 提供单文件组件脚本部分的编译上下文和工具方法
 */
export class ScriptCompileContext {
  /** 是否为JavaScript文件 */
  isJS: boolean
  /** 是否为TypeScript文件 */
  isTS: boolean
  /** 是否为自定义元素 */
  isCE = false

  /** 脚本AST */
  scriptAst: Program | null
  /** script-setup AST */
  scriptSetupAst: Program | null

  /** 源代码 */
  source: string = this.descriptor.source
  /** 文件名 */
  filename: string = this.descriptor.filename
  /** 用于代码操作的MagicString实例 */
  s: MagicString = new MagicString(this.source)
  /** 脚本起始偏移量 */
  startOffset: number | undefined =
    this.descriptor.scriptSetup?.loc.start.offset
  /** 脚本结束偏移量 */
  endOffset: number | undefined = this.descriptor.scriptSetup?.loc.end.offset

  // 导入/类型分析
  /** 类型作用域 */
  scope?: TypeScope
  /** 全局作用域 */
  globalScopes?: TypeScope[]
  /** 用户导入的绑定 */
  userImports: Record<string, ImportBinding> = Object.create(null)

  // 宏存在检查
  /** 是否有defineProps调用 */
  hasDefinePropsCall = false
  /** 是否有defineEmit调用 */
  hasDefineEmitCall = false
  /** 是否有defineExpose调用 */
  hasDefineExposeCall = false
  /** 是否有默认导出名称 */
  hasDefaultExportName = false
  /** 是否有默认导出的render函数 */
  hasDefaultExportRender = false
  hasDefineOptionsCall = false
  hasDefineSlotsCall = false
  hasDefineModelCall = false

  // defineProps
  propsCall: CallExpression | undefined
  propsDecl: Node | undefined
  propsRuntimeDecl: Node | undefined
  propsTypeDecl: Node | undefined
  propsDestructureDecl: ObjectPattern | undefined
  propsDestructuredBindings: PropsDestructureBindings = Object.create(null)
  propsDestructureRestId: string | undefined
  propsRuntimeDefaults: Node | undefined

  // defineEmits
  emitsRuntimeDecl: Node | undefined
  emitsTypeDecl: Node | undefined
  emitDecl: Node | undefined

  // defineModel
  modelDecls: Record<string, ModelDecl> = Object.create(null)

  // defineOptions
  optionsRuntimeDecl: Node | undefined

  // codegen
  bindingMetadata: BindingMetadata = {}
  helperImports: Set<string> = new Set()
  helper(key: string): string {
    this.helperImports.add(key)
    return `_${key}`
  }

  /**
   * to be exposed on compiled script block for HMR cache busting
   */
  deps?: Set<string>

  /**
   * cache for resolved fs
   */
  fs?: NonNullable<SFCScriptCompileOptions['fs']>

  /**
   * 构造函数
   * @param descriptor - SFC描述符
   * @param options - 脚本编译选项
   */
  constructor(
    public descriptor: SFCDescriptor,
    public options: Partial<SFCScriptCompileOptions>,
  ) {
    const { script, scriptSetup } = descriptor
    const scriptLang = script && script.lang
    const scriptSetupLang = scriptSetup && scriptSetup.lang

    // 判断是否为JS或TS文件
    this.isJS =
      scriptLang === 'js' ||
      scriptLang === 'jsx' ||
      scriptSetupLang === 'js' ||
      scriptSetupLang === 'jsx'
    this.isTS =
      scriptLang === 'ts' ||
      scriptLang === 'tsx' ||
      scriptSetupLang === 'ts' ||
      scriptSetupLang === 'tsx'

    // 设置是否为自定义元素
    const customElement = options.customElement
    const filename = this.descriptor.filename
    if (customElement) {
      this.isCE =
        typeof customElement === 'boolean'
          ? customElement
          : customElement(filename)
    }
    // 解析器插件配置
    const plugins: ParserPlugin[] = resolveParserPlugins(
      (scriptLang || scriptSetupLang)!,
      options.babelParserPlugins,
    )

    // 解析代码为AST
    function parse(input: string, offset: number): Program {
      try {
        return babelParse(input, {
          plugins,
          sourceType: 'module',
        }).program
      } catch (e: any) {
        e.message = `[vue/compiler-sfc] ${e.message}\n\n${
          descriptor.filename
        }\n${generateCodeFrame(
          descriptor.source,
          e.pos + offset,
          e.pos + offset + 1,
        )}`
        throw e
      }
    }

    // 解析普通script块为AST
    this.scriptAst =
      descriptor.script &&
      parse(descriptor.script.content, descriptor.script.loc.start.offset)

    // 解析script-setup块为AST
    this.scriptSetupAst =
      descriptor.scriptSetup &&
      parse(descriptor.scriptSetup!.content, this.startOffset!)
  }

  /**
   * 获取节点的源代码字符串
   * @param node - AST节点
   * @param scriptSetup - 是否为script-setup块
   * @returns 节点的源代码
   */
  getString(node: Node, scriptSetup = true): string {
    const block = scriptSetup
      ? this.descriptor.scriptSetup!
      : this.descriptor.script!
    // 从源代码中提取节点对应的字符串
    return block.content.slice(node.start!, node.end!)
  }

/**
   * 发出警告信息
   * @param msg - 警告信息
   * @param node - 相关AST节点
   * @param scope - 类型作用域（可选）
   */
  warn(msg: string, node: Node, scope?: TypeScope): void {
    // 生成警告并添加到警告列表
    warn(generateError(msg, node, this, scope))
  }

/**
   * 发出错误信息并抛出异常
   * @param msg - 错误信息
   * @param node - 相关AST节点
   * @param scope - 类型作用域（可选）
   */
  error(msg: string, node: Node, scope?: TypeScope): never {
    // 生成错误信息并抛出异常
    throw new Error(
      `[@vue/compiler-sfc] ${generateError(msg, node, this, scope)}`,
    )
  }
}

/**
 * 生成格式化的错误信息
 * @param msg - 错误信息
 * @param node - 相关AST节点
 * @param ctx - 脚本编译上下文
 * @param scope - 类型作用域（可选）
 * @returns 格式化的错误信息字符串
 */
function generateError(
  msg: string,
  node: Node,
  ctx: ScriptCompileContext,
  scope?: TypeScope,
) {
  // 计算偏移量
  const offset = scope ? scope.offset : ctx.startOffset!
  // 返回包含文件名和代码帧的错误信息
  return `${msg}\n\n${(scope || ctx.descriptor).filename}\n${generateCodeFrame(
    (scope || ctx.descriptor).source,
    node.start! + offset,
    node.end! + offset,
  )}`
}

/**
 * 解析器插件配置
 * @param lang - 语言类型
 * @param userPlugins - 用户提供的插件（可选）
 * @param dts - 是否为类型声明文件（可选）
 * @returns 解析器插件列表
 */
export function resolveParserPlugins(
  lang: string,
  userPlugins?: ParserPlugin[],
  dts = false,
): ParserPlugin[] {
  // 初始化插件列表
  const plugins: ParserPlugin[] = []
  // 如果用户未提供importAttributes插件，则添加
  if (
    !userPlugins ||
    !userPlugins.some(
      p =>
        p === 'importAssertions' ||
        p === 'importAttributes' ||
        (isArray(p) && p[0] === 'importAttributes'),
    )
  ) {
    // 添加importAttributes插件
    plugins.push('importAttributes')
  }
  // 针对JSX/TSX添加jsx插件
  if (lang === 'jsx' || lang === 'tsx' || lang === 'mtsx') {
    // 添加jsx插件
    plugins.push('jsx')
  } else if (userPlugins) {
    // If don't match the case of adding jsx
    // should remove the jsx from user options
    userPlugins = userPlugins.filter(p => p !== 'jsx')
  }
  if (lang === 'ts' || lang === 'mts' || lang === 'tsx' || lang === 'mtsx') {
    plugins.push(['typescript', { dts }], 'explicitResourceManagement')
    if (!userPlugins || !userPlugins.includes('decorators')) {
      plugins.push('decorators-legacy')
    }
  }
  if (userPlugins) {
    plugins.push(...userPlugins)
  }
  return plugins
}
