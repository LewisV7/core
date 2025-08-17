/**
 * 编译器核心工具函数
 * 包含AST节点操作、类型检查和转换辅助方法
 */
import {
  type BlockCodegenNode,
  type CacheExpression,
  type CallExpression,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type IfBranchNode,
  type InterpolationNode,
  type JSChildNode,
  type MemoExpression,
  NodeTypes,
  type ObjectExpression,
  type Position,
  type Property,
  type RenderSlotCall,
  type RootNode,
  type SimpleExpressionNode,
  type SlotOutletNode,
  type TemplateChildNode,
  type TemplateNode,
  type TextNode,
  type VNodeCall,
  createCallExpression,
  createObjectExpression,
} from './ast'
import type { TransformContext } from './transform'
import {
  BASE_TRANSITION,
  GUARD_REACTIVE_PROPS,
  KEEP_ALIVE,
  MERGE_PROPS,
  NORMALIZE_PROPS,
  SUSPENSE,
  TELEPORT,
  TO_HANDLERS,
  WITH_MEMO,
} from './runtimeHelpers'
import { NOOP, isObject, isString } from '@vue/shared'
import type { PropsExpression } from './transforms/transformElement'
import { parseExpression } from '@babel/parser'
import type { Expression, Node } from '@babel/types'
import { unwrapTSNode } from './babelUtils'

/**
 * 检查一个节点是否是静态表达式
 * @param p 要检查的JS子节点
 * @returns 如果节点是静态表达式则返回true，否则返回false
 */
export const isStaticExp = (p: JSChildNode): p is SimpleExpressionNode =>
  p.type === NodeTypes.SIMPLE_EXPRESSION && p.isStatic

/**
 * 检查一个标签是否是Vue核心组件
 * @param tag 标签名称
 * @returns 如果是核心组件则返回对应的symbol，否则返回undefined
 */
export function isCoreComponent(tag: string): symbol | void {
  switch (tag) {
    case 'Teleport':
    case 'teleport':
      return TELEPORT
    case 'Suspense':
    case 'suspense':
      return SUSPENSE
    case 'KeepAlive':
    case 'keep-alive':
      return KEEP_ALIVE
    case 'BaseTransition':
    case 'base-transition':
      return BASE_TRANSITION
  }
}

/**
 * 匹配非标识符的正则表达式
 * 用于检查字符串是否不能作为有效的JavaScript标识符
 */
const nonIdentifierRE = /^$|^\d|[^\$\w\xA0-\uFFFF]/

/**
 * 检查一个字符串是否是简单标识符
 * @param name 要检查的字符串
 * @returns 如果是有效标识符则返回true，否则返回false
 */
export const isSimpleIdentifier = (name: string): boolean =>
!nonIdentifierRE.test(name)

/**
 * 成员表达式词法分析状态
 * 用于词法分析器跟踪解析成员表达式时的状态
 */
enum MemberExpLexState {
  inMemberExp,
  inBrackets,
  inParens,
  inString,
}

/**
 * 匹配有效标识符首字符的正则表达式
 */
const validFirstIdentCharRE = /[A-Za-z_$\xA0-\uFFFF]/

/**
 * 匹配有效标识符字符的正则表达式
 */
const validIdentCharRE = /[\.\?\w$\xA0-\uFFFF]/

/**
 * 匹配空白字符与点或方括号组合的正则表达式
 */
const whitespaceRE = /\s+[.[]\s*|\s*[.[]\s+/g


/**
 * 获取表达式的源代码
 * @param exp 表达式节点
 * @returns 表达式的源代码字符串
 */
const getExpSource = (exp: ExpressionNode): string =>
  exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : exp.loc.source

/**
 * 检查一个表达式是否是成员表达式的简单词法分析器
 * 仅在根级别检查有效性（即不验证方括号内的表达式）
 * @param exp 要检查的表达式节点
 * @returns 如果是成员表达式则返回true，否则返回false
 */
export const isMemberExpressionBrowser = (exp: ExpressionNode): boolean => {
  // remove whitespaces around . or [ first
  const path = getExpSource(exp)
    .trim()
    .replace(whitespaceRE, s => s.trim())

  let state = MemberExpLexState.inMemberExp
  let stateStack: MemberExpLexState[] = []
  let currentOpenBracketCount = 0
  let currentOpenParensCount = 0
  let currentStringType: "'" | '"' | '`' | null = null

  for (let i = 0; i < path.length; i++) {
    const char = path.charAt(i)
    switch (state) {
      case MemberExpLexState.inMemberExp:
        if (char === '[') {
          stateStack.push(state)
          state = MemberExpLexState.inBrackets
          currentOpenBracketCount++
        } else if (char === '(') {
          stateStack.push(state)
          state = MemberExpLexState.inParens
          currentOpenParensCount++
        } else if (
          !(i === 0 ? validFirstIdentCharRE : validIdentCharRE).test(char)
        ) {
          return false
        }
        break
      case MemberExpLexState.inBrackets:
        if (char === `'` || char === `"` || char === '`') {
          stateStack.push(state)
          state = MemberExpLexState.inString
          currentStringType = char
        } else if (char === `[`) {
          currentOpenBracketCount++
        } else if (char === `]`) {
          if (!--currentOpenBracketCount) {
            state = stateStack.pop()!
          }
        }
        break
      case MemberExpLexState.inParens:
        if (char === `'` || char === `"` || char === '`') {
          stateStack.push(state)
          state = MemberExpLexState.inString
          currentStringType = char
        } else if (char === `(`) {
          currentOpenParensCount++
        } else if (char === `)`) {
          // if the exp ends as a call then it should not be considered valid
          if (i === path.length - 1) {
            return false
          }
          if (!--currentOpenParensCount) {
            state = stateStack.pop()!
          }
        }
        break
      case MemberExpLexState.inString:
        if (char === currentStringType) {
          state = stateStack.pop()!
          currentStringType = null
        }
        break
    }
  }
  return !currentOpenBracketCount && !currentOpenParensCount
}

/**
 * 在非浏览器环境中检查一个表达式是否是成员表达式
 * @param exp 要检查的表达式节点
 * @param context 转换上下文
 * @returns 如果是成员表达式则返回true，否则返回false
 */
export const isMemberExpressionNode: (
  exp: ExpressionNode,
  context: TransformContext,
) => boolean = __BROWSER__
  ? (NOOP as any)
  : (exp, context) => {
      try {
        let ret: Node =
          exp.ast ||
          parseExpression(getExpSource(exp), {
            plugins: context.expressionPlugins
              ? [...context.expressionPlugins, 'typescript']
              : ['typescript'],
          })
        ret = unwrapTSNode(ret) as Expression
        return (
          ret.type === 'MemberExpression' ||
          ret.type === 'OptionalMemberExpression' ||
          (ret.type === 'Identifier' && ret.name !== 'undefined')
        )
      } catch (e) {
        return false
      }
    }


/**
 * 根据环境选择合适的方法检查一个表达式是否是成员表达式
 * 在浏览器环境中使用isMemberExpressionBrowser，在非浏览器环境中使用isMemberExpressionNode
 * @param exp 要检查的表达式节点
 * @param context 转换上下文
 * @returns 如果是成员表达式则返回true，否则返回false
 */
export const isMemberExpression: (
  exp: ExpressionNode,
  context: TransformContext,
) => boolean = __BROWSER__ ? isMemberExpressionBrowser : isMemberExpressionNode

/**
 * 匹配函数表达式的正则表达式
 * 用于识别箭头函数和普通函数定义
 */
const fnExpRE =
  /^\s*(async\s*)?(\([^)]*?\)|[\w$_]+)\s*(:[^=]+)?=>|^\s*(async\s+)?function(?:\s+[\w$]+)?\s*\(/

/**
 * 在浏览器环境中检查一个表达式是否是函数表达式
 * @param exp 要检查的表达式节点
 * @returns 如果是函数表达式则返回true，否则返回false
 */
export const isFnExpressionBrowser: (exp: ExpressionNode) => boolean = exp =>
  fnExpRE.test(getExpSource(exp))

/**
 * 在非浏览器环境中检查一个表达式是否是函数表达式
 * @param exp 要检查的表达式节点
 * @param context 转换上下文
 * @returns 如果是函数表达式则返回true，否则返回false
 */
export const isFnExpressionNode: (
  exp: ExpressionNode,
  context: TransformContext,
) => boolean = __BROWSER__
  ? (NOOP as any)
  : (exp, context) => {
      try {
        let ret: Node =
          exp.ast ||
          parseExpression(getExpSource(exp), {
            plugins: context.expressionPlugins
              ? [...context.expressionPlugins, 'typescript']
              : ['typescript'],
          })
        // parser may parse the exp as statements when it contains semicolons
        if (ret.type === 'Program') {
          ret = ret.body[0]
          if (ret.type === 'ExpressionStatement') {
            ret = ret.expression
          }
        }
        ret = unwrapTSNode(ret) as Expression
        return (
          ret.type === 'FunctionExpression' ||
          ret.type === 'ArrowFunctionExpression'
        )
      } catch (e) {
        return false
      }
    }

/**
 * 根据环境选择合适的方法检查一个表达式是否是函数表达式
 * 在浏览器环境中使用isFnExpressionBrowser，在非浏览器环境中使用isFnExpressionNode
 * @param exp 要检查的表达式节点
 * @param context 转换上下文
 * @returns 如果是函数表达式则返回true，否则返回false
 */
export const isFnExpression: (
  exp: ExpressionNode,
  context: TransformContext,
) => boolean = __BROWSER__ ? isFnExpressionBrowser : isFnExpressionNode

/**
 * 复制并更新位置信息
 * 创建一个位置对象的副本，并根据给定的源字符串和字符数前进位置
 * @param pos 原始位置对象
 * @param source 源字符串
 * @param numberOfCharacters 要前进的字符数，默认为源字符串的长度
 * @returns 更新后的新位置对象
 */
export function advancePositionWithClone(
  pos: Position,
  source: string,
  numberOfCharacters: number = source.length,
): Position {
  return advancePositionWithMutation(
    {
      offset: pos.offset,
      line: pos.line,
      column: pos.column,
    },
    source,
    numberOfCharacters,
  )
}

/**
 * 通过修改而不克隆来前进位置（出于性能原因）
 * 由于在解析器中被频繁调用，因此采用修改原对象的方式以提高性能
 * @param pos 要修改的位置对象
 * @param source 源字符串
 * @param numberOfCharacters 要前进的字符数，默认为源字符串的长度
 * @returns 修改后的位置对象
 */
export function advancePositionWithMutation(
  pos: Position,
  source: string,
  numberOfCharacters: number = source.length,
): Position {
  let linesCount = 0
  let lastNewLinePos = -1
  for (let i = 0; i < numberOfCharacters; i++) {
    if (source.charCodeAt(i) === 10 /* newline char code */) {
      linesCount++
      lastNewLinePos = i
    }
  }

  pos.offset += numberOfCharacters
  pos.line += linesCount
  pos.column =
    lastNewLinePos === -1
      ? pos.column + numberOfCharacters
      : numberOfCharacters - lastNewLinePos

  return pos
}

/**
 * 断言函数
 * 检查条件是否为真，如果为假则抛出错误
 * @param condition 要检查的条件
 * @param msg 错误消息，可选
 */
export function assert(condition: boolean, msg?: string): void {
  /* v8 ignore next 3 */
  if (!condition) {
    throw new Error(msg || `unexpected compiler condition`)
  }
}

/**
 * 在元素节点的属性中查找指定名称的指令
 * @param node 元素节点
 * @param name 指令名称或正则表达式
 * @param allowEmpty 是否允许空表达式的指令，默认为false
 * @returns 找到的指令节点，如果没有找到则返回undefined
 */
export function findDir(
  node: ElementNode,
  name: string | RegExp,
  allowEmpty: boolean = false,
): DirectiveNode | undefined {
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (
      p.type === NodeTypes.DIRECTIVE &&
      (allowEmpty || p.exp) &&
      (isString(name) ? p.name === name : name.test(p.name))
    ) {
      return p
    }
  }
}

/**
 * 在元素节点的属性中查找指定名称的属性
 * @param node 元素节点
 * @param name 属性名称
 * @param dynamicOnly 是否只查找动态属性，默认为false
 * @param allowEmpty 是否允许空值的属性，默认为false
 * @returns 找到的属性节点，如果没有找到则返回undefined
 */
export function findProp(
  node: ElementNode,
  name: string,
  dynamicOnly: boolean = false,
  allowEmpty: boolean = false,
): ElementNode['props'][0] | undefined {
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      if (dynamicOnly) continue
      if (p.name === name && (p.value || allowEmpty)) {
        return p
      }
    } else if (
      p.name === 'bind' &&
      (p.exp || allowEmpty) &&
      isStaticArgOf(p.arg, name)
    ) {
      return p
    }
  }
}

/**
 * 检查指令参数是否是指定名称的静态参数
 * @param arg 指令参数
 * @param name 要检查的参数名称
 * @returns 如果是指定名称的静态参数则返回true，否则返回false
 */
export function isStaticArgOf(
  arg: DirectiveNode['arg'],
  name: string,
): boolean {
  return !!(arg && isStaticExp(arg) && arg.content === name)
}

/**
 * 检查元素节点是否有动态键的v-bind指令
 * @param node 元素节点
 * @returns 如果有动态键的v-bind指令则返回true，否则返回false
 */
export function hasDynamicKeyVBind(node: ElementNode): boolean {
  return node.props.some(
    p =>
      p.type === NodeTypes.DIRECTIVE &&
      p.name === 'bind' &&
      (!p.arg || // v-bind="obj"
        p.arg.type !== NodeTypes.SIMPLE_EXPRESSION || // v-bind:[_ctx.foo]
        !p.arg.isStatic), // v-bind:[foo]
  )
}

/**
 * 检查节点是否是文本节点或插值节点
 * @param node 要检查的模板子节点
 * @returns 如果是文本节点或插值节点则返回true，否则返回false
 */
export function isText(
  node: TemplateChildNode,
): node is TextNode | InterpolationNode {
  return node.type === NodeTypes.INTERPOLATION || node.type === NodeTypes.TEXT
}

/**
 * 检查属性是否是v-pre指令
 * @param p 要检查的元素属性
 * @returns 如果是v-pre指令则返回true，否则返回false
 */
export function isVPre(p: ElementNode['props'][0]): p is DirectiveNode {
  return p.type === NodeTypes.DIRECTIVE && p.name === 'pre'
}

/**
 * 检查属性是否是v-slot指令
 * @param p 要检查的元素属性
 * @returns 如果是v-slot指令则返回true，否则返回false
 */
export function isVSlot(p: ElementNode['props'][0]): p is DirectiveNode {
  return p.type === NodeTypes.DIRECTIVE && p.name === 'slot'
}

/**
 * 检查节点是否是模板节点
 * @param node 要检查的根节点或模板子节点
 * @returns 如果是模板节点则返回true，否则返回false
 */
export function isTemplateNode(
  node: RootNode | TemplateChildNode,
): node is TemplateNode {
  return (
    node.type === NodeTypes.ELEMENT && node.tagType === ElementTypes.TEMPLATE
  )
}

/**
 * 检查节点是否是插槽出口节点
 * @param node 要检查的根节点或模板子节点
 * @returns 如果是插槽出口节点则返回true，否则返回false
 */
export function isSlotOutlet(
  node: RootNode | TemplateChildNode,
): node is SlotOutletNode {
  return node.type === NodeTypes.ELEMENT && node.tagType === ElementTypes.SLOT
}

/**
 * 包含属性处理辅助函数的集合
 * 用于识别规范化属性和保护响应式属性的辅助函数
 */
const propsHelperSet = new Set([NORMALIZE_PROPS, GUARD_REACTIVE_PROPS])

/**
 * 获取未规范化的属性
 * 递归解析属性表达式，直到找到非辅助函数调用的表达式
 * @param props 属性表达式或空对象字符串
 * @param callPath 调用路径，用于跟踪辅助函数调用链
 * @returns 未规范化的属性和调用路径数组
 */
function getUnnormalizedProps(
    props: PropsExpression | '{}',
  callPath: CallExpression[] = [],
): [PropsExpression | '{}', CallExpression[]] {
  if (
    props &&
    !isString(props) &&
    props.type === NodeTypes.JS_CALL_EXPRESSION
  ) {
    const callee = props.callee
    if (!isString(callee) && propsHelperSet.has(callee)) {
      return getUnnormalizedProps(
        props.arguments[0] as PropsExpression,
        callPath.concat(props),
      )
    }
  }
  return [props, callPath]
}
/**
 * 向VNode或渲染插槽调用中注入属性
 * @param node VNode调用或渲染插槽调用节点
 * @param prop 要注入的属性
 * @param context 转换上下文
 */
export function injectProp(
  node: VNodeCall | RenderSlotCall,
  prop: Property,
  context: TransformContext,
): void {
  let propsWithInjection: ObjectExpression | CallExpression | undefined
  /**
   * 1. mergeProps(...)
   * 2. toHandlers(...)
   * 3. normalizeProps(...)
   * 4. normalizeProps(guardReactiveProps(...))
   *
   * we need to get the real props before normalization
   */
  let props =
    node.type === NodeTypes.VNODE_CALL ? node.props : node.arguments[2]
  let callPath: CallExpression[] = []
  let parentCall: CallExpression | undefined
  if (
    props &&
    !isString(props) &&
    props.type === NodeTypes.JS_CALL_EXPRESSION
  ) {
    const ret = getUnnormalizedProps(props)
    props = ret[0]
    callPath = ret[1]
    parentCall = callPath[callPath.length - 1]
  }

  if (props == null || isString(props)) {
    propsWithInjection = createObjectExpression([prop])
  } else if (props.type === NodeTypes.JS_CALL_EXPRESSION) {
    // merged props... add ours
    // only inject key to object literal if it's the first argument so that
    // if doesn't override user provided keys
    const first = props.arguments[0] as string | JSChildNode
    if (!isString(first) && first.type === NodeTypes.JS_OBJECT_EXPRESSION) {
      // #6631
      if (!hasProp(prop, first)) {
        first.properties.unshift(prop)
      }
    } else {
      if (props.callee === TO_HANDLERS) {
        // #2366
        propsWithInjection = createCallExpression(context.helper(MERGE_PROPS), [
          createObjectExpression([prop]),
          props,
        ])
      } else {
        props.arguments.unshift(createObjectExpression([prop]))
      }
    }
    !propsWithInjection && (propsWithInjection = props)
  } else if (props.type === NodeTypes.JS_OBJECT_EXPRESSION) {
    if (!hasProp(prop, props)) {
      props.properties.unshift(prop)
    }
    propsWithInjection = props
  } else {
    // single v-bind with expression, return a merged replacement
    propsWithInjection = createCallExpression(context.helper(MERGE_PROPS), [
      createObjectExpression([prop]),
      props,
    ])
    // in the case of nested helper call, e.g. `normalizeProps(guardReactiveProps(props))`,
    // it will be rewritten as `normalizeProps(mergeProps({ key: 0 }, props))`,
    // the `guardReactiveProps` will no longer be needed
    if (parentCall && parentCall.callee === GUARD_REACTIVE_PROPS) {
      parentCall = callPath[callPath.length - 2]
    }
  }
  if (node.type === NodeTypes.VNODE_CALL) {
    if (parentCall) {
      parentCall.arguments[0] = propsWithInjection
    } else {
      node.props = propsWithInjection
    }
  } else {
    if (parentCall) {
      parentCall.arguments[0] = propsWithInjection
    } else {
      node.arguments[2] = propsWithInjection
    }
  }
}

/**
 * 检查属性是否已存在于对象表达式中，避免覆盖用户提供的键
 * @param prop 要检查的属性
 * @param props 对象表达式
 * @returns 如果属性已存在则返回true，否则返回false
 */
function hasProp(prop: Property, props: ObjectExpression) {
  let result = false
  if (prop.key.type === NodeTypes.SIMPLE_EXPRESSION) {
    const propKeyName = prop.key.content
    result = props.properties.some(
      p =>
        p.key.type === NodeTypes.SIMPLE_EXPRESSION &&
        p.key.content === propKeyName,
    )
  }
  return result
}

/**
 * 将名称转换为有效的资源ID
 * @param name 资源名称
 * @param type 资源类型，可以是'component'、'directive'或'filter'
 * @returns 有效的资源ID字符串
 */
export function toValidAssetId(
  name: string,
  type: 'component' | 'directive' | 'filter',
): string {
  // see issue#4422, we need adding identifier on validAssetId if variable `name` has specific character
  return `_${type}_${name.replace(/[^\w]/g, (searchValue, replaceValue) => {
    return searchValue === '-' ? '_' : name.charCodeAt(replaceValue).toString()
  })}`
}

/**
 * 检查节点是否包含引用当前上下文作用域ID的表达式
 * @param node 要检查的节点，可以是模板子节点、条件分支节点、表达式节点等
 * @param ids 转换上下文中的标识符
 * @returns 如果节点包含引用则返回true，否则返回false
 */
export function hasScopeRef(
  node:
    | TemplateChildNode
    | IfBranchNode
    | ExpressionNode
    | CacheExpression
    | undefined,
  ids: TransformContext['identifiers'],
): boolean {
  if (!node || Object.keys(ids).length === 0) {
    return false
  }
  switch (node.type) {
    case NodeTypes.ELEMENT:
      for (let i = 0; i < node.props.length; i++) {
        const p = node.props[i]
        if (
          p.type === NodeTypes.DIRECTIVE &&
          (hasScopeRef(p.arg, ids) || hasScopeRef(p.exp, ids))
        ) {
          return true
        }
      }
      return node.children.some(c => hasScopeRef(c, ids))
    case NodeTypes.FOR:
      if (hasScopeRef(node.source, ids)) {
        return true
      }
      return node.children.some(c => hasScopeRef(c, ids))
    case NodeTypes.IF:
      return node.branches.some(b => hasScopeRef(b, ids))
    case NodeTypes.IF_BRANCH:
      if (hasScopeRef(node.condition, ids)) {
        return true
      }
      return node.children.some(c => hasScopeRef(c, ids))
    case NodeTypes.SIMPLE_EXPRESSION:
      return (
        !node.isStatic &&
        isSimpleIdentifier(node.content) &&
        !!ids[node.content]
      )
    case NodeTypes.COMPOUND_EXPRESSION:
      return node.children.some(c => isObject(c) && hasScopeRef(c, ids))
    case NodeTypes.INTERPOLATION:
    case NodeTypes.TEXT_CALL:
      return hasScopeRef(node.content, ids)
    case NodeTypes.TEXT:
    case NodeTypes.COMMENT:
    case NodeTypes.JS_CACHE_EXPRESSION:
      return false
    default:
      if (__DEV__) {
        const exhaustiveCheck: never = node
        exhaustiveCheck
      }
      return false
  }
}

/**
 * 获取带有记忆化的VNode调用
 * @param node 块代码生成节点或记忆化表达式
 * @returns VNode调用或渲染插槽调用
 */
export function getMemoedVNodeCall(
  node: BlockCodegenNode | MemoExpression,
): VNodeCall | RenderSlotCall {
  if (node.type === NodeTypes.JS_CALL_EXPRESSION && node.callee === WITH_MEMO) {
    return node.arguments[1].returns as VNodeCall
  } else {
    return node
  }
}

/**
 * 用于匹配v-for指令中别名和迭代对象的正则表达式
 * 捕获组1: 别名部分
 * 捕获组2: 迭代对象部分
 */
export const forAliasRE: RegExp = /([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/
