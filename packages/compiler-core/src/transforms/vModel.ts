// ***********************************************************************
// * v-model 指令转换处理
// * 负责处理组件中的 v-model 指令，将其转换为对应的属性和事件处理代码
// ***********************************************************************
import type { DirectiveTransform } from '../transform'
import {
  ConstantTypes,
  ElementTypes,
  type ExpressionNode,
  NodeTypes,
  type Property,
  createCompoundExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  hasScopeRef,
  isMemberExpression,
  isSimpleIdentifier,
  isStaticExp,
} from '../utils'
import { IS_REF } from '../runtimeHelpers'
import { BindingTypes } from '../options'
import { camelize } from '@vue/shared'

/**
 * v-model 指令转换函数
 * @param dir 指令节点
 * @param node 元素节点
 * @param context 转换上下文
 * @returns 转换后的属性对象
 */
export const transformModel: DirectiveTransform = (dir, node, context) => {
  const { exp, arg } = dir // exp: 表达式, arg: 参数
  // 检查是否存在表达式
  if (!exp) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_NO_EXPRESSION, dir.loc),
    )
    return createTransformProps()
  }

  // 我们假设 v-model 指令总是被解析的
  // (不是由转换人工创建的)
  // (not artificially created by a transform)
  const rawExp = exp.loc.source.trim()
  const expString =
    exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : rawExp

  // 在 SFC <script setup> 内联模式下，表达式可能已被转换为 _unref(exp)
  // _unref(exp)
  const bindingType = context.bindingMetadata[rawExp]

  // 检查是否绑定到 props
  if (
    bindingType === BindingTypes.PROPS ||
    bindingType === BindingTypes.PROPS_ALIASED
  ) {
    context.onError(createCompilerError(ErrorCodes.X_V_MODEL_ON_PROPS, exp.loc))
    return createTransformProps()
  }

  // 检查是否可能是 ref
  const maybeRef =
    // 非浏览器环境
    !__BROWSER__ &&
    context.inline &&
    (bindingType === BindingTypes.SETUP_LET ||
      bindingType === BindingTypes.SETUP_REF ||
      bindingType === BindingTypes.SETUP_MAYBE_REF)

  if (!expString.trim() || (!isMemberExpression(exp, context) && !maybeRef)) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_MALFORMED_EXPRESSION, exp.loc),
    )
    return createTransformProps()
  }

  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    isSimpleIdentifier(expString) &&
    context.identifiers[expString]
  ) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_MODEL_ON_SCOPE_VARIABLE, exp.loc),
    )
    return createTransformProps()
  }

  const propName = arg ? arg : createSimpleExpression('modelValue', true)
  const eventName = arg
    ? isStaticExp(arg)
      ? `onUpdate:${camelize(arg.content)}`
      : createCompoundExpression(['"onUpdate:" + ', arg])
    : `onUpdate:modelValue`

  let assignmentExp: ExpressionNode
  const eventArg = context.isTS ? `($event: any)` : `$event`
  if (maybeRef) {
    if (bindingType === BindingTypes.SETUP_REF) {
      // v-model 用于已知的 ref
      assignmentExp = createCompoundExpression([
        `${eventArg} => ((`,
        createSimpleExpression(rawExp, false, exp.loc),
        `).value = $event)`,
      ])
    } else {
      // v-model 用于 <script setup> 内联模式下可能的 ref 绑定
      // 赋值需要检查绑定是否实际上是一个 ref
      const altAssignment =
        bindingType === BindingTypes.SETUP_LET ? `${rawExp} = $event` : `null`
      assignmentExp = createCompoundExpression([
        `${eventArg} => (${context.helperString(IS_REF)}(${rawExp}) ? (`,
        createSimpleExpression(rawExp, false, exp.loc),
        `).value = $event : ${altAssignment})`,
      ])
    }
  } else {
    // 普通赋值表达式
    assignmentExp = createCompoundExpression([
      `${eventArg} => ((`,
      exp,
      `) = $event)`,
    ])
  }

  const props = [
    // modelValue: foo
    createObjectProperty(propName, dir.exp!),
    // "onUpdate:modelValue": $event => (foo = $event)
    createObjectProperty(eventName, assignmentExp),
  ]

  // 如果适用（当不引用任何作用域变量时），缓存 v-model 处理函数
  if (
    !__BROWSER__ &&
    context.prefixIdentifiers &&
    !context.inVOnce &&
    context.cacheHandlers &&
    !hasScopeRef(exp, context.identifiers)
  ) {
    props[1].value = context.cache(props[1].value)
  }

  // modelModifiers: { foo: true, "bar-baz": true } - 处理修饰符
  if (dir.modifiers.length && node.tagType === ElementTypes.COMPONENT) {
    const modifiers = dir.modifiers
      .map(m => m.content)
      .map(m => (isSimpleIdentifier(m) ? m : JSON.stringify(m)) + `: true`)
      .join(`, `)
    const modifiersKey = arg
      ? isStaticExp(arg)
        ? `${arg.content}Modifiers`
        : createCompoundExpression([arg, ' + "Modifiers"'])
      : `modelModifiers`
    props.push(
      createObjectProperty(
        modifiersKey,
        createSimpleExpression(
          `{ ${modifiers} }`,
          false,
          dir.loc,
          ConstantTypes.CAN_CACHE,
        ),
      ),
    )
  }

  return createTransformProps(props)
}

/**
 * 创建转换后的属性对象
 * @param props 属性数组
 * @returns 包含属性的对象
 */
function createTransformProps(props: Property[] = []) {
  return { props } // 返回属性对象
}
