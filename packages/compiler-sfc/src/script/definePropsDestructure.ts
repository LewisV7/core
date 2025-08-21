/**
 * 处理defineProps解构声明的工具函数
 * 包含props解构的处理和转换逻辑
 */
import type {
  BlockStatement,
  Expression,
  Identifier,
  Node,
  ObjectPattern,
  Program,
  VariableDeclaration,
} from '@babel/types'
import { walk } from 'estree-walker'
import {
  BindingTypes,
  TS_NODE_TYPES,
  extractIdentifiers,
  isFunctionType,
  isInDestructureAssignment,
  isReferencedIdentifier,
  isStaticProperty,
  unwrapTSNode,
  walkFunctionParams,
} from '@vue/compiler-dom'
import { genPropsAccessExp } from '@vue/shared'
import { isCallOf, resolveObjectKey } from './utils'
import type { ScriptCompileContext } from './context'
import { DEFINE_PROPS } from './defineProps'

/**
 * 处理props解构声明
 * @param ctx 脚本编译上下文
 * @param declId 对象模式的解构标识符
 */
export function processPropsDestructure(
  ctx: ScriptCompileContext,
  declId: ObjectPattern,
): void {
  if (ctx.options.propsDestructure === 'error') {
    ctx.error(`Props destructure is explicitly prohibited via config.`, declId)
  } else if (ctx.options.propsDestructure === false) {
    return
  }

  // 存储props解构声明
  ctx.propsDestructureDecl = declId

  /**
   * 注册props绑定
   * @param key props的键名
   * @param local 本地变量名
   * @param defaultValue 默认值表达式
   */
  const registerBinding = (
    key: string,
    local: string,
    defaultValue?: Expression,
  ) => {
    ctx.propsDestructuredBindings[key] = { local, default: defaultValue }
    if (local !== key) {
      // 标记为props别名
      ctx.bindingMetadata[local] = BindingTypes.PROPS_ALIASED
      ;(ctx.bindingMetadata.__propsAliases ||
        (ctx.bindingMetadata.__propsAliases = {}))[local] = key
    }
  }

  // 遍历所有解构属性
  for (const prop of declId.properties) {
    if (prop.type === 'ObjectProperty') {
      const propKey = resolveObjectKey(prop.key, prop.computed)

      if (!propKey) {
        ctx.error(
          `${DEFINE_PROPS}() destructure cannot use computed key.`,
          prop.key,
        )
      }

      if (prop.value.type === 'AssignmentPattern') {
        // 处理默认值 { foo = 123 }
        const { left, right } = prop.value
        if (left.type !== 'Identifier') {
          ctx.error(
            `${DEFINE_PROPS}() destructure does not support nested patterns.`,
            left,
          )
        }
        registerBinding(propKey, left.name, right)
      } else if (prop.value.type === 'Identifier') {
        // 简单解构
        registerBinding(propKey, prop.value.name)
      } else {
        ctx.error(
          `${DEFINE_PROPS}() destructure does not support nested patterns.`,
          prop.value,
        )
      }
    } else {
      // 处理剩余展开
      ctx.propsDestructureRestId = (prop.argument as Identifier).name
      // 注册绑定
      ctx.bindingMetadata[ctx.propsDestructureRestId] = 
        BindingTypes.SETUP_REACTIVE_CONST
    }
  }
}

/**
 * 作用域记录
 * true表示prop绑定，false表示本地绑定
 */
type Scope = Record<string, boolean>

/**
 * 转换解构的props
 * @param ctx 脚本编译上下文
 * @param vueImportAliases Vue导入别名
 */
export function transformDestructuredProps(
  ctx: ScriptCompileContext,
  vueImportAliases: Record<string, string>,
): void {
  if (ctx.options.propsDestructure === false) {
    return
  }

  // 初始化根作用域
  const rootScope: Scope = Object.create(null)
  const scopeStack: Scope[] = [rootScope]
  let currentScope: Scope = rootScope
  // 排除的标识符集合
  const excludedIds = new WeakSet<Identifier>()
  // 父节点栈
  const parentStack: Node[] = []
  // 本地props名称到公共名称的映射
  const propsLocalToPublicMap: Record<string, string> = Object.create(null)

  // 初始化根作用域的props绑定
  for (const key in ctx.propsDestructuredBindings) {
    const { local } = ctx.propsDestructuredBindings[key]
    rootScope[local] = true
    propsLocalToPublicMap[local] = key
  }

  /** 进入新作用域 */
  function pushScope() {
    scopeStack.push((currentScope = Object.create(currentScope)))
  }

  /** 退出当前作用域 */
  function popScope() {
    scopeStack.pop()
    currentScope = scopeStack[scopeStack.length - 1] || null
  }

  /**
   * 注册本地绑定
   * @param id 标识符
   */
  function registerLocalBinding(id: Identifier) {
    excludedIds.add(id)
    if (currentScope) {
      currentScope[id.name] = false
    } else {
      ctx.error(
        'registerBinding called without active scope, something is wrong.',
        id,
      )
    }
  }

  /**
   * 遍历作用域
   * @param node 程序或块语句节点
   * @param isRoot 是否为根作用域
   */
  function walkScope(node: Program | BlockStatement, isRoot = false) {
    for (const stmt of node.body) {
      if (stmt.type === 'VariableDeclaration') {
        walkVariableDeclaration(stmt, isRoot)
      } else if (
        stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration'
      ) {
        if (stmt.declare || !stmt.id) continue
        registerLocalBinding(stmt.id)
      } else if (
        (stmt.type === 'ForOfStatement' || stmt.type === 'ForInStatement') &&
        stmt.left.type === 'VariableDeclaration'
      ) {
        walkVariableDeclaration(stmt.left)
      } else if (
        stmt.type === 'ExportNamedDeclaration' &&
        stmt.declaration &&
        stmt.declaration.type === 'VariableDeclaration'
      ) {
        walkVariableDeclaration(stmt.declaration, isRoot)
      } else if (
        stmt.type === 'LabeledStatement' &&
        stmt.body.type === 'VariableDeclaration'
      ) {
        walkVariableDeclaration(stmt.body, isRoot)
      }
    }
  }

  /**
   * 遍历变量声明
   * @param stmt 变量声明节点
   * @param isRoot 是否为根作用域
   */
  function walkVariableDeclaration(stmt: VariableDeclaration, isRoot = false) {
    if (stmt.declare) {
      return
    }
    for (const decl of stmt.declarations) {
      const isDefineProps = 
        isRoot && decl.init && isCallOf(unwrapTSNode(decl.init), 'defineProps')
      for (const id of extractIdentifiers(decl.id)) {
        if (isDefineProps) {
          // 对于defineProps解构，仅排除它们，因为它们已经作为knownProps传入
          excludedIds.add(id)
        } else {
          registerLocalBinding(id)
        }
      }
    }
  }

  /**
   * 重写标识符
   * @param id 标识符节点
   * @param parent 父节点
   * @param parentStack 父节点栈
   */
  function rewriteId(id: Identifier, parent: Node, parentStack: Node[]) {
    if (
      (parent.type === 'AssignmentExpression' && id === parent.left) ||
      parent.type === 'UpdateExpression'
    ) {
      ctx.error(`Cannot assign to destructured props as they are readonly.`, id)
    }

    if (isStaticProperty(parent) && parent.shorthand) {
      // 处理属性简写
      // { prop } -> { prop: __props.prop }
      if (
        !(parent as any).inPattern ||
        isInDestructureAssignment(parent, parentStack)
      ) {
        ctx.s.appendLeft(
          id.end! + ctx.startOffset!,
          `: ${genPropsAccessExp(propsLocalToPublicMap[id.name])}`,
        )
      }
    } else {
      // x --> __props.x
      ctx.s.overwrite(
        id.start! + ctx.startOffset!,
        id.end! + ctx.startOffset!,
        genPropsAccessExp(propsLocalToPublicMap[id.name]),
      )
    }
  }

  /**
   * 检查使用情况
   * @param node 节点
   * @param method 方法名
   * @param alias 别名
   */
  function checkUsage(node: Node, method: string, alias = method) {
    if (isCallOf(node, alias)) {
      const arg = unwrapTSNode(node.arguments[0])
      if (arg.type === 'Identifier' && currentScope[arg.name]) {
        ctx.error(
          `"${arg.name}" is a destructured prop and should not be passed directly to ${method}(). ` +
            `Pass a getter () => ${arg.name} instead.`,
          arg,
        )
      }
    }
  }

  // check root scope first
  const ast = ctx.scriptSetupAst!
  walkScope(ast, true)
  walk(ast, {
    enter(node: Node, parent: Node | null) {
      parent && parentStack.push(parent)

      // skip type nodes
      if (
        parent &&
        parent.type.startsWith('TS') &&
        !TS_NODE_TYPES.includes(parent.type)
      ) {
        return this.skip()
      }

      checkUsage(node, 'watch', vueImportAliases.watch)
      checkUsage(node, 'toRef', vueImportAliases.toRef)

      // function scopes
      if (isFunctionType(node)) {
        pushScope()
        walkFunctionParams(node, registerLocalBinding)
        if (node.body.type === 'BlockStatement') {
          walkScope(node.body)
        }
        return
      }

      // catch param
      if (node.type === 'CatchClause') {
        pushScope()
        if (node.param && node.param.type === 'Identifier') {
          registerLocalBinding(node.param)
        }
        walkScope(node.body)
        return
      }

      // non-function block scopes
      if (node.type === 'BlockStatement' && !isFunctionType(parent!)) {
        pushScope()
        walkScope(node)
        return
      }

      if (node.type === 'Identifier') {
        if (
          isReferencedIdentifier(node, parent!, parentStack) &&
          !excludedIds.has(node)
        ) {
          if (currentScope[node.name]) {
            rewriteId(node, parent!, parentStack)
          }
        }
      }
    },
    leave(node: Node, parent: Node | null) {
      parent && parentStack.pop()
      if (
        (node.type === 'BlockStatement' && !isFunctionType(parent!)) ||
        isFunctionType(node) ||
        node.type === 'CatchClause'
      ) {
        popScope()
      }
    },
  })
}
