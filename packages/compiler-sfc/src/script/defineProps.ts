import type {
  Expression,
  LVal,
  Node,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
} from '@babel/types'
import { BindingTypes, isFunctionType, unwrapTSNode } from '@vue/compiler-dom'
import type { ScriptCompileContext } from './context'
import {
  type TypeResolveContext,
  inferRuntimeType,
  resolveTypeElements,
} from './resolveType'
import {
  UNKNOWN_TYPE,
  concatStrings,
  getEscapedPropName,
  isCallOf,
  isLiteralNode,
  resolveObjectKey,
  toRuntimeTypeString,
} from './utils'
import { genModelProps } from './defineModel'
import { getObjectOrArrayExpressionKeys } from './analyzeScriptBindings'
import { processPropsDestructure } from './definePropsDestructure'

export const DEFINE_PROPS = 'defineProps'
export const WITH_DEFAULTS = 'withDefaults'

export interface PropTypeData {
  key: string
  type: string[]
  required: boolean
  skipCheck: boolean
}

export type PropsDestructureBindings = Record<
  string, // public prop key
  {
    local: string // local identifier, may be different
    default?: Expression
  }
>

export function processDefineProps(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
  isWithDefaults = false,
): boolean {
  if (!isCallOf(node, DEFINE_PROPS)) {
    return processWithDefaults(ctx, node, declId)
  }

  if (ctx.hasDefinePropsCall) {
    ctx.error(`duplicate ${DEFINE_PROPS}() call`, node)
  }
  ctx.hasDefinePropsCall = true
  ctx.propsRuntimeDecl = node.arguments[0]

  // register bindings
  if (ctx.propsRuntimeDecl) {
    for (const key of getObjectOrArrayExpressionKeys(ctx.propsRuntimeDecl)) {
      if (!(key in ctx.bindingMetadata)) {
        ctx.bindingMetadata[key] = BindingTypes.PROPS
      }
    }
  }

  // 处理带类型参数的调用 - 从类型参数推断运行时类型
  if (node.typeParameters) {
    // 检查是否同时提供了类型参数和非类型参数
    if (ctx.propsRuntimeDecl) {
      ctx.error(
        `${DEFINE_PROPS}() 不能同时接受类型参数和非类型参数 ` +
          `请只使用其中一种方式。`,
        node,
      )
    }
    // 保存类型参数声明，用于后续类型推断
    ctx.propsTypeDecl = node.typeParameters.params[0]
  }

  // 处理 props 解构赋值模式
  if (!isWithDefaults && declId && declId.type === 'ObjectPattern') {
    processPropsDestructure(ctx, declId)
  }

  // 保存 props 调用节点和声明标识符到上下文
  ctx.propsCall = node
  ctx.propsDecl = declId

  return true
}

function processWithDefaults(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  if (!isCallOf(node, WITH_DEFAULTS)) {
    return false
  }
  if (
    !processDefineProps(
      ctx,
      node.arguments[0],
      declId,
      true /* isWithDefaults */,
    )
  ) {
    ctx.error(
      `${WITH_DEFAULTS}' first argument must be a ${DEFINE_PROPS} call.`,
      node.arguments[0] || node,
    )
  }

  if (ctx.propsRuntimeDecl) {
    ctx.error(
      `${WITH_DEFAULTS} can only be used with type-based ` +
        `${DEFINE_PROPS} declaration.`,
      node,
    )
  }
  // 警告：当使用解构时withDefaults可能不必要
  if (declId && declId.type === 'ObjectPattern') {
    ctx.warn(
      `${WITH_DEFAULTS}()在与${DEFINE_PROPS}()一起使用解构时不必要。\n` +
        `使用withDefaults()时响应式解构将被禁用。\n` +
        `建议使用解构默认值，例如：const { foo = 1 } = defineProps(...)。 `,
      node.callee,
    )
  }
  ctx.propsRuntimeDefaults = node.arguments[1]
  if (!ctx.propsRuntimeDefaults) {
    ctx.error(`The 2nd argument of ${WITH_DEFAULTS} is required.`, node)
  }
  ctx.propsCall = node

  return true
}

/**
 * 生成运行时props声明
 * @param ctx 脚本编译上下文
 * @returns 生成的运行时props声明字符串，如果没有则返回undefined
 */
export function genRuntimeProps(ctx: ScriptCompileContext): string | undefined {
  let propsDecls: undefined | string

  // 如果有运行时声明
  if (ctx.propsRuntimeDecl) {
    propsDecls = ctx.getString(ctx.propsRuntimeDecl).trim()
    // 处理解构声明
    if (ctx.propsDestructureDecl) {
      const defaults: string[] = []
      // 遍历所有解构绑定的属性
      for (const key in ctx.propsDestructuredBindings) {
        // 生成解构默认值
        const d = genDestructuredDefaultValue(ctx, key)
        const finalKey = getEscapedPropName(key)
        if (d)
          // 添加到默认值数组
          defaults.push(
            `${finalKey}: ${d.valueString}${
              d.needSkipFactory ? `, __skip_${finalKey}: true` : ``
            }`,
          )
      }
      // 如果有默认值，合并它们
      if (defaults.length) {
        // 使用mergeDefaults辅助函数合并默认值
        propsDecls = `/*@__PURE__*/${ctx.helper(
          `mergeDefaults`,
        )}(${propsDecls}, {\n  ${defaults.join(',\n  ')}\n})`
      }
    }
  // 如果有类型声明，从类型提取运行时props
  } else if (ctx.propsTypeDecl) {
    propsDecls = extractRuntimeProps(ctx)
  }

  // 生成模型属性
  const modelsDecls = genModelProps(ctx)

  // 如果同时有props和models声明，合并它们
  if (propsDecls && modelsDecls) {
    // 使用mergeModels辅助函数合并
    return `/*@__PURE__*/${ctx.helper(
      'mergeModels',
    )}(${propsDecls}, ${modelsDecls})`
  // 否则返回modelsDecls或propsDecls
  } else {
    return modelsDecls || propsDecls
  }
}

/**
 * 从类型声明中提取运行时props
 * @param ctx 类型解析上下文
 * @returns 生成的运行时props声明字符串，如果没有则返回undefined
 */
export function extractRuntimeProps(
  ctx: TypeResolveContext,
): string | undefined {
  // 只有当propsTypeDecl存在时才会调用此函数
  const props = resolveRuntimePropsFromType(ctx, ctx.propsTypeDecl!)
  if (!props.length) {
    return
  }

  const propStrings: string[] = []
  const hasStaticDefaults = hasStaticWithDefaults(ctx)

  // 遍历所有props生成运行时声明
  for (const prop of props) {
    propStrings.push(genRuntimePropFromType(ctx, prop, hasStaticDefaults))
    // 注册绑定
    if ('bindingMetadata' in ctx && !(prop.key in ctx.bindingMetadata)) {
      ctx.bindingMetadata[prop.key] = BindingTypes.PROPS
    }
  }

  // 构建props声明字符串
  let propsDecls = `{
    ${propStrings.join(',\n    ')}\n  }`

  // 如果有运行时默认值且没有静态默认值，合并默认值
  if (ctx.propsRuntimeDefaults && !hasStaticDefaults) {
    propsDecls = `/*@__PURE__*/${ctx.helper(
      'mergeDefaults',
    )}(${propsDecls}, ${ctx.getString(ctx.propsRuntimeDefaults)})`
  }

  return propsDecls
}

/**
 * 从类型节点解析运行时props
 * @param ctx 类型解析上下文
 * @param node 类型节点
 * @returns props类型数据数组
 */
function resolveRuntimePropsFromType(
  ctx: TypeResolveContext,
  node: Node,
): PropTypeData[] {
  const props: PropTypeData[] = []
  const elements = resolveTypeElements(ctx, node)
  // 遍历所有属性
  for (const key in elements.props) {
    const e = elements.props[key]
    let type = inferRuntimeType(ctx, e)
    let skipCheck = false
    // 对于包含unknown类型的结果，跳过检查
    if (type.includes(UNKNOWN_TYPE)) {
      if (type.includes('Boolean') || type.includes('Function')) {
        type = type.filter(t => t !== UNKNOWN_TYPE)
        skipCheck = true
      } else {
        type = ['null']
      }
    }
    props.push({
      key,
      required: !e.optional,
      type: type || [`null`],
      skipCheck,
    })
  }
  return props
}

/**
 * 根据属性类型数据生成运行时prop声明
 * @param ctx 类型解析上下文
 * @param prop 包含key、required、type等信息的属性类型数据
 * @param hasStaticDefaults 是否有静态默认值
 * @returns 生成的运行时prop声明字符串
 */
function genRuntimePropFromType(
  ctx: TypeResolveContext,
  { key, required, type, skipCheck }: PropTypeData,
  hasStaticDefaults: boolean,
): string {
  let defaultString: string | undefined
  // 生成解构默认值
  const destructured = genDestructuredDefaultValue(ctx, key, type)
  if (destructured) {
    defaultString = `default: ${destructured.valueString}${
      destructured.needSkipFactory ? `, skipFactory: true` : ``
    }`
  } else if (hasStaticDefaults) {
    // 查找对应的静态默认值
    const prop = (ctx.propsRuntimeDefaults as ObjectExpression).properties.find(
      node => {
        if (node.type === 'SpreadElement') return false
        return resolveObjectKey(node.key, node.computed) === key
      },
    ) as ObjectProperty | ObjectMethod
    if (prop) {
      if (prop.type === 'ObjectProperty') {
        // 属性有对应的静态默认值
        defaultString = `default: ${ctx.getString(prop.value)}`
      } else {
        defaultString = `${prop.async ? 'async ' : ''}${
          prop.kind !== 'method' ? `${prop.kind} ` : ''
        }default() ${ctx.getString(prop.body)}`
      }
    }
  }

  const finalKey = getEscapedPropName(key)
  // 非生产环境：包含完整类型检查
  if (!ctx.options.isProd) {
    return `${finalKey}: { ${concatStrings([
      `type: ${toRuntimeTypeString(type)}`,
      `required: ${required}`,
      skipCheck && 'skipCheck: true',
      defaultString,
    ])} }`
  } else if (
    type.some(
      el =>
        el === 'Boolean' ||
        ((!hasStaticDefaults || defaultString) && el === 'Function'),
    )
  ) {
    // 生产环境：对于布尔值和函数类型(有默认值或非静态)，保留类型
    return `${finalKey}: { ${concatStrings([
      `type: ${toRuntimeTypeString(type)}`,
      defaultString,
    ])} }`
  } else {
    // 对于自定义元素，保留类型
    if (ctx.isCE) {
      if (defaultString) {
        return `${finalKey}: ${`{ ${defaultString}, type: ${toRuntimeTypeString(
          type,
        )} }`}`
      } else {
        return `${finalKey}: {type: ${toRuntimeTypeString(type)}}`
      }
    }

    // 生产环境：检查无用，简化输出
    return `${finalKey}: ${defaultString ? `{ ${defaultString} }` : `{}`}`
  }
}

/**
 * 检查默认值。如果默认对象是仅包含静态属性的对象字面量，
 * 我们可以直接生成更优化的默认声明。否则我们将不得不回退到运行时合并。
 */
function hasStaticWithDefaults(ctx: TypeResolveContext): boolean {
  return !!(// 检查是否有运行时默认值且是对象表达式
    ctx.propsRuntimeDefaults &&
    ctx.propsRuntimeDefaults.type === 'ObjectExpression' &&
    // 确保所有属性都不是展开元素且键是字面量
    ctx.propsRuntimeDefaults.properties.every(
      node =>
        node.type !== 'SpreadElement' &&
        (!node.computed || node.key.type.endsWith('Literal')),
    )
  )
}

/**
 * 生成解构默认值
 * @param ctx 类型解析上下文
 * @param key 属性键名
 * @param inferredType 推断的类型数组
 * @returns 包含值字符串和是否需要跳过工厂函数的对象，如果没有默认值则返回undefined
 */
function genDestructuredDefaultValue(
  ctx: TypeResolveContext,
  key: string,
  inferredType?: string[],
):
  | {
      valueString: string
      needSkipFactory: boolean
    }
  | undefined {
  const destructured = ctx.propsDestructuredBindings[key]
  const defaultVal = destructured && destructured.default
  if (defaultVal) {
    const value = ctx.getString(defaultVal)
    const unwrapped = unwrapTSNode(defaultVal)

    // 检查默认值类型是否与声明的类型匹配
    if (inferredType && inferredType.length && !inferredType.includes('null')) {
      const valueType = inferValueType(unwrapped)
      if (valueType && !inferredType.includes(valueType)) {
        ctx.error(
          `属性 "${key}" 的默认值与声明的类型不匹配。`,
          unwrapped,
        )
      }
    }

    // If the default value is a function or is an identifier referencing
    // external value, skip factory wrap. This is needed when using
    // destructure w/ runtime declaration since we cannot safely infer
    // whether the expected runtime prop type is `Function`.
    const needSkipFactory =
      !inferredType &&
      (isFunctionType(unwrapped) || unwrapped.type === 'Identifier')

    const needFactoryWrap =
      !needSkipFactory &&
      !isLiteralNode(unwrapped) &&
      !inferredType?.includes('Function')

    return {
      valueString: needFactoryWrap ? `() => (${value})` : value,
      needSkipFactory,
    }
  }
}

/**
 * 非全面的、尽力而为的运行时值类型推断
 * 这用于在使用props解构时捕获默认值/类型声明不匹配
 * @param node AST节点
 * @returns 推断的类型字符串，如果无法推断则返回undefined
 */
function inferValueType(node: Node): string | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return 'String'
    case 'NumericLiteral':
      return 'Number'
    case 'BooleanLiteral':
      return 'Boolean'
    case 'ObjectExpression':
      return 'Object'
    case 'ArrayExpression':
      return 'Array'
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return 'Function'
    case 'Identifier':
      // 处理特殊标识符
      if (node.name === 'undefined') return 'undefined'
      if (node.name === 'null') return 'null'
      // 无法确定其他标识符的类型
      return undefined
    default:
      return undefined
  }
}
