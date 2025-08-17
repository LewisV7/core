// ***********************************************************************
// * v-slot 指令转换处理
// * 负责处理组件中的 v-slot 指令，构建插槽对象并处理作用域
// ***********************************************************************
import {
  type CallExpression,
  type ConditionalExpression,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type FunctionExpression,
  NodeTypes,
  type ObjectExpression,
  type Property,
  type SlotsExpression,
  type SourceLocation,
  type TemplateChildNode,
  createArrayExpression,
  createCallExpression,
  createConditionalExpression,
  createFunctionExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import type { NodeTransform, TransformContext } from '../transform'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  assert,
  findDir,
  hasScopeRef,
  isStaticExp,
  isTemplateNode,
  isVSlot,
} from '../utils'
import { CREATE_SLOTS, RENDER_LIST, WITH_CTX } from '../runtimeHelpers'
import { createForLoopParams, finalizeForParseResult } from './vFor'
import { SlotFlags, slotFlagsText } from '@vue/shared'

const defaultFallback = createSimpleExpression(`undefined`, false)

// 一个节点转换函数，用于：
// 1. 跟踪作用域插槽的标识符，防止它们被 transformExpression 前缀化
//    这仅在非浏览器构建中使用 { prefixIdentifiers: true } 时应用
// 2. 跟踪 v-slot 的深度，以便知道插槽是否在另一个插槽内部
//    注意：退出回调在同一节点上的 buildSlots() 之前执行，因此只有嵌套插槽才会看到正数
// 1. Tracks scope identifiers for scoped slots so that they don't get prefixed
//    by transformExpression. This is only applied in non-browser builds with
//    { prefixIdentifiers: true }.
// 2. Track v-slot depths so that we know a slot is inside another slot.
//    Note the exit callback is executed before buildSlots() on the same node,
//    so only nested slots see positive numbers.
/**
 * 跟踪插槽作用域的节点转换函数
 * @param node 当前处理的 AST 节点
 * @param context 转换上下文
 * @returns 清理函数，在子节点处理完成后执行
 */
export const trackSlotScopes: NodeTransform = (node, context) => {
  if (
    node.type === NodeTypes.ELEMENT &&
    (node.tagType === ElementTypes.COMPONENT ||
      node.tagType === ElementTypes.TEMPLATE)
  ) {
    // We are only checking non-empty v-slot here
    // since we only care about slots that introduce scope variables.
    const vSlot = findDir(node, 'slot')
    if (vSlot) {
      const slotProps = vSlot.exp
      if (!__BROWSER__ && context.prefixIdentifiers) {
        slotProps && context.addIdentifiers(slotProps)
      }
      context.scopes.vSlot++
      return () => {
        if (!__BROWSER__ && context.prefixIdentifiers) {
          slotProps && context.removeIdentifiers(slotProps)
        }
        context.scopes.vSlot--
      }
    }
  }
}

// 一个节点转换函数，用于跟踪带有 v-for 的作用域插槽的标识符
// 此转换仅在非浏览器构建中使用 { prefixIdentifiers: true } 时应用
// This transform is only applied in non-browser builds with { prefixIdentifiers: true }
/**
 * 跟踪带 v-for 的插槽作用域的节点转换函数
 * @param node 当前处理的 AST 节点
 * @param context 转换上下文
 * @returns 清理函数，在子节点处理完成后执行
 */
export const trackVForSlotScopes: NodeTransform = (node, context) => {
  let vFor
  if (
    isTemplateNode(node) &&
    node.props.some(isVSlot) &&
    (vFor = findDir(node, 'for'))
  ) {
    const result = vFor.forParseResult
    if (result) {
      finalizeForParseResult(result, context)
      const { value, key, index } = result
      const { addIdentifiers, removeIdentifiers } = context
      value && addIdentifiers(value)
      key && addIdentifiers(key)
      index && addIdentifiers(index)

      return () => {
        value && removeIdentifiers(value)
        key && removeIdentifiers(key)
        index && removeIdentifiers(index)
      }
    }
  }
}

/**
 * 插槽函数构建器类型定义
 * @param slotProps 插槽属性表达式
 * @param vFor v-for 指令节点
 * @param slotChildren 插槽子节点
 * @param loc 源代码位置信息
 * @returns 构建的函数表达式
 */
export type SlotFnBuilder = (
  slotProps: ExpressionNode | undefined,
  vFor: DirectiveNode | undefined,
  slotChildren: TemplateChildNode[],
  loc: SourceLocation,
) => FunctionExpression

/**
 * 客户端插槽函数构建器
 * @param props 插槽属性
 * @param _vForExp v-for 表达式（未使用）
 * @param children 插槽子节点
 * @param loc 源代码位置信息
 * @returns 构建的函数表达式
 */
const buildClientSlotFn: SlotFnBuilder = (props, _vForExp, children, loc) =>
  createFunctionExpression(
    props,
    children,
    false /* newline */,
    true /* isSlot */,
    children.length ? children[0].loc : loc,
  )

// 与其他指令转换不同，v-slot 处理在 transformElement 期间被调用，
// 用于为组件构建插槽对象
// transformElement to build the slots object for a component.
/**
 * 构建组件的插槽对象
 * @param node 元素节点
 * @param context 转换上下文
 * @param buildSlotFn 插槽函数构建器，默认为客户端构建器
 * @returns 包含插槽表达式和动态插槽标志的对象
 */
export function buildSlots(
  node: ElementNode,
  context: TransformContext,
  buildSlotFn: SlotFnBuilder = buildClientSlotFn,
): {
  slots: SlotsExpression
  hasDynamicSlots: boolean
} {
  context.helper(WITH_CTX)

  const { children, loc } = node
  const slotsProperties: Property[] = []
  const dynamicSlots: (ConditionalExpression | CallExpression)[] = []

  // 如果插槽在 v-for 或另一个 v-slot 内部，强制使其成为动态的
  // 因为它可能使用了作用域变量
  // since it likely uses a scope variable.
  let hasDynamicSlots = context.scopes.vSlot > 0 || context.scopes.vFor > 0
  // 使用 `prefixIdentifiers: true` 时，可以进一步优化，
  // 仅当插槽实际使用作用域变量时才使其动态化
  // it dynamic only when the slot actually uses the scope variables.
  if (!__BROWSER__ && !context.ssr && context.prefixIdentifiers) {
    hasDynamicSlots = hasScopeRef(node, context.identifiers)
  }

  // 1. 检查组件自身是否有带 slotProps 的插槽
//    <Comp v-slot="{ prop }"/>
  //    <Comp v-slot="{ prop }"/>
  const onComponentSlot = findDir(node, 'slot', true)
  if (onComponentSlot) {
    const { arg, exp } = onComponentSlot
    if (arg && !isStaticExp(arg)) {
      hasDynamicSlots = true
    }
    slotsProperties.push(
      createObjectProperty(
        arg || createSimpleExpression('default', true),
        buildSlotFn(exp, undefined, children, loc),
      ),
    )
  }

  // 2. 遍历子节点并检查 template 插槽
//    <template v-slot:foo="{ prop }">
  //    <template v-slot:foo="{ prop }">
  let hasTemplateSlots = false
  let hasNamedDefaultSlot = false
  const implicitDefaultChildren: TemplateChildNode[] = []
  const seenSlotNames = new Set<string>()
  let conditionalBranchIndex = 0

  for (let i = 0; i < children.length; i++) {
    const slotElement = children[i]
    let slotDir

    if (
      !isTemplateNode(slotElement) ||
      !(slotDir = findDir(slotElement, 'slot', true))
    ) {
      // not a <template v-slot>, skip.
      if (slotElement.type !== NodeTypes.COMMENT) {
        implicitDefaultChildren.push(slotElement)
      }
      continue
    }

    if (onComponentSlot) {
      // already has on-component slot - this is incorrect usage.
      context.onError(
        createCompilerError(ErrorCodes.X_V_SLOT_MIXED_SLOT_USAGE, slotDir.loc),
      )
      break
    }

    hasTemplateSlots = true
    const { children: slotChildren, loc: slotLoc } = slotElement
    const {
      arg: slotName = createSimpleExpression(`default`, true),
      exp: slotProps,
      loc: dirLoc,
    } = slotDir

    // 检查名称是否是动态的
    let staticSlotName: string | undefined
    if (isStaticExp(slotName)) {
      staticSlotName = slotName ? slotName.content : `default`
    } else {
      hasDynamicSlots = true
    }

    const vFor = findDir(slotElement, 'for')
    const slotFunction = buildSlotFn(slotProps, vFor, slotChildren, slotLoc)

    // 检查此插槽是否是条件性的 (v-if/v-for)
    let vIf: DirectiveNode | undefined
    let vElse: DirectiveNode | undefined
    if ((vIf = findDir(slotElement, 'if'))) {
      hasDynamicSlots = true
      dynamicSlots.push(
        createConditionalExpression(
          vIf.exp!,
          buildDynamicSlot(slotName, slotFunction, conditionalBranchIndex++),
          defaultFallback,
        ),
      )
    } else if (
      (vElse = findDir(slotElement, /^else(-if)?$/, true /* allowEmpty */))
    ) {
      // 查找相邻的 v-if
      let j = i
      let prev
      while (j--) {
        prev = children[j]
        if (prev.type !== NodeTypes.COMMENT && isNonWhitespaceContent(prev)) {
          break
        }
      }
      if (prev && isTemplateNode(prev) && findDir(prev, /^(else-)?if$/)) {
        __TEST__ && assert(dynamicSlots.length > 0)
        // 将此插槽附加到前一个条件
        let conditional = dynamicSlots[
          dynamicSlots.length - 1
        ] as ConditionalExpression
        while (
          conditional.alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION
        ) {
          conditional = conditional.alternate
        }
        conditional.alternate = vElse.exp
          ? createConditionalExpression(
              vElse.exp,
              buildDynamicSlot(
                slotName,
                slotFunction,
                conditionalBranchIndex++,
              ),
              defaultFallback,
            )
          : buildDynamicSlot(slotName, slotFunction, conditionalBranchIndex++)
      } else {
        context.onError(
          createCompilerError(ErrorCodes.X_V_ELSE_NO_ADJACENT_IF, vElse.loc),
        )
      }
    } else if (vFor) {
      hasDynamicSlots = true
      const parseResult = vFor.forParseResult
      if (parseResult) {
        finalizeForParseResult(parseResult, context)
        // 将动态插槽渲染为数组并添加到 createSlot() 参数中
  // 运行时知道如何适当地处理它
        // args. The runtime knows how to handle it appropriately.
        dynamicSlots.push(
          createCallExpression(context.helper(RENDER_LIST), [
            parseResult.source,
            createFunctionExpression(
              createForLoopParams(parseResult),
              buildDynamicSlot(slotName, slotFunction),
              true /* force newline */,
            ),
          ]),
        )
      } else {
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION,
            vFor.loc,
          ),
        )
      }
    } else {
      // 检查重复的静态名称
      if (staticSlotName) {
        if (seenSlotNames.has(staticSlotName)) {
          context.onError(
            createCompilerError(
              ErrorCodes.X_V_SLOT_DUPLICATE_SLOT_NAMES,
              dirLoc,
            ),
          )
          continue
        }
        seenSlotNames.add(staticSlotName)
        if (staticSlotName === 'default') {
          hasNamedDefaultSlot = true
        }
      }
      slotsProperties.push(createObjectProperty(slotName, slotFunction))
    }
  }

  if (!onComponentSlot) {
    const buildDefaultSlotProperty = (
      props: ExpressionNode | undefined,
      children: TemplateChildNode[],
    ) => {
      const fn = buildSlotFn(props, undefined, children, loc)
      if (__COMPAT__ && context.compatConfig) {
        fn.isNonScopedSlot = true
      }
      return createObjectProperty(`default`, fn)
    }

    if (!hasTemplateSlots) {
      // 隐式默认插槽 (在组件上)
      slotsProperties.push(buildDefaultSlotProperty(undefined, children))
    } else if (
      implicitDefaultChildren.length &&
      // #3766
      // with whitespace: 'preserve', whitespaces between slots will end up in
      // implicitDefaultChildren. Ignore if all implicit children are whitespaces.
      implicitDefaultChildren.some(node => isNonWhitespaceContent(node))
    ) {
      // 隐式默认插槽 (与命名插槽混合)
      if (hasNamedDefaultSlot) {
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_SLOT_EXTRANEOUS_DEFAULT_SLOT_CHILDREN,
            implicitDefaultChildren[0].loc,
          ),
        )
      } else {
        slotsProperties.push(
          buildDefaultSlotProperty(undefined, implicitDefaultChildren),
        )
      }
    }
  }

  const slotFlag = hasDynamicSlots
    ? SlotFlags.DYNAMIC
    : hasForwardedSlots(node.children)
      ? SlotFlags.FORWARDED
      : SlotFlags.STABLE
  let slots = createObjectExpression(
    slotsProperties.concat(
      createObjectProperty(
        `_`,
        // 2 = 已编译但动态 = 可以跳过标准化，但必须运行 diff
  // 1 = 已编译且静态 = 可以跳过标准化和 diff 以优化性能
        // 1 = compiled and static = can skip normalization AND diff as optimized
        createSimpleExpression(
          slotFlag + (__DEV__ ? ` /* ${slotFlagsText[slotFlag]} */` : ``),
          false,
        ),
      ),
    ),
    loc,
  ) as SlotsExpression
  if (dynamicSlots.length) {
    slots = createCallExpression(context.helper(CREATE_SLOTS), [
      slots,
      createArrayExpression(dynamicSlots),
    ]) as SlotsExpression
  }

  return {
    slots,
    hasDynamicSlots,
  }
}

/**
 * 构建动态插槽对象
 * @param name 插槽名称表达式
 * @param fn 插槽函数
 * @param index 可选的索引，用于条件分支
 * @returns 构建的对象表达式
 */
function buildDynamicSlot(
  name: ExpressionNode,
  fn: FunctionExpression,
  index?: number,
): ObjectExpression {
  const props = [
    createObjectProperty(`name`, name),
    createObjectProperty(`fn`, fn),
  ]
  if (index != null) {
    props.push(
      createObjectProperty(`key`, createSimpleExpression(String(index), true)),
    )
  }
  return createObjectExpression(props)
}

/**
 * 检查是否有转发的插槽
 * @param children 子节点列表
 * @returns 如果有转发的插槽则返回 true
 */
function hasForwardedSlots(children: TemplateChildNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    switch (child.type) {
      case NodeTypes.ELEMENT:
        if (
          child.tagType === ElementTypes.SLOT ||
          hasForwardedSlots(child.children)
        ) {
          return true
        }
        break
      case NodeTypes.IF:
        if (hasForwardedSlots(child.branches)) return true
        break
      case NodeTypes.IF_BRANCH:
      case NodeTypes.FOR:
        if (hasForwardedSlots(child.children)) return true
        break
      default:
        break
    }
  }
  return false
}

/**
 * 检查节点是否为非空白内容
 * @param node 模板子节点
 * @returns 如果节点是非空白内容则返回 true
 */
function isNonWhitespaceContent(node: TemplateChildNode): boolean {
  if (node.type !== NodeTypes.TEXT && node.type !== NodeTypes.TEXT_CALL)
    return true
  return node.type === NodeTypes.TEXT
    ? !!node.content.trim()
    : isNonWhitespaceContent(node.content)
}
