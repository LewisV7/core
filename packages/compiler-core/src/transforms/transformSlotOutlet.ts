/**
 * 插槽出口转换模块
 * 此模块负责将 <slot> 标签转换为渲染函数调用
 */
import type { NodeTransform, TransformContext } from '../transform'
import {
  type CallExpression,
  type ExpressionNode,
  NodeTypes,
  type SlotOutletNode,
  createCallExpression,
  createFunctionExpression,
  createSimpleExpression,
} from '../ast'
import { isSlotOutlet, isStaticArgOf, isStaticExp } from '../utils'
import { type PropsExpression, buildProps } from './transformElement'
import { ErrorCodes, createCompilerError } from '../errors'
import { RENDER_SLOT } from '../runtimeHelpers'
import { camelize } from '@vue/shared'
import { processExpression } from './transformExpression'

/**
 * 转换插槽出口节点
 * 将 <slot> 标签转换为 renderSlot 函数调用
 * @param {Node} node - 要转换的 AST 节点
 * @param {TransformContext} context - 转换上下文
 * @returns {void} 无返回值，直接修改节点的 codegenNode
 */
export const transformSlotOutlet: NodeTransform = (node, context) => {
  // 仅处理插槽出口节点
  if (isSlotOutlet(node)) {
    const { children, loc } = node
    // 处理插槽出口的名称和属性
    const { slotName, slotProps } = processSlotOutlet(node, context)

    // 构建 renderSlot 函数的参数
    const slotArgs: CallExpression['arguments'] = [
      context.prefixIdentifiers ? `_ctx.$slots` : `$slots`,
      slotName,
      '{}',
      'undefined',
      'true',
    ]
    let expectedLen = 2

    if (slotProps) {
      slotArgs[2] = slotProps
      expectedLen = 3
    }

    if (children.length) {
      slotArgs[3] = createFunctionExpression([], children, false, false, loc)
      expectedLen = 4
    }

    if (context.scopeId && !context.slotted) {
      expectedLen = 5
    }
    slotArgs.splice(expectedLen) // remove unused arguments

    node.codegenNode = createCallExpression(
      context.helper(RENDER_SLOT),
      slotArgs,
      loc,
    )
  }
}

/**
 * 处理插槽出口后的返回结果接口
 */
interface SlotOutletProcessResult {
  slotName: string | ExpressionNode
  slotProps: PropsExpression | undefined
}

/**
 * 处理插槽出口节点的名称和属性
 * @param {SlotOutletNode} node - 插槽出口节点
 * @param {TransformContext} context - 转换上下文
 * @returns {SlotOutletProcessResult} 包含插槽名称和属性的对象
 */
export function processSlotOutlet(
  node: SlotOutletNode,
  context: TransformContext,
): SlotOutletProcessResult {
  // 默认插槽名称为 'default'
  let slotName: string | ExpressionNode = `"default"`
  let slotProps: PropsExpression | undefined = undefined

  // 收集非 name 属性
  const nonNameProps = []
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    // 处理普通属性
    if (p.type === NodeTypes.ATTRIBUTE) {
      if (p.value) {
        if (p.name === 'name') {
          slotName = JSON.stringify(p.value.content)
        // 处理指令
    } else {
          p.name = camelize(p.name)
          nonNameProps.push(p)
        }
      }
    } else {
      if (p.name === 'bind' && isStaticArgOf(p.arg, 'name')) {
        if (p.exp) {
          slotName = p.exp
        } else if (p.arg && p.arg.type === NodeTypes.SIMPLE_EXPRESSION) {
          const name = camelize(p.arg.content)
          slotName = p.exp = createSimpleExpression(name, false, p.arg.loc)
          if (!__BROWSER__) {
            slotName = p.exp = processExpression(p.exp, context)
          }
        }
      } else {
        if (p.name === 'bind' && p.arg && isStaticExp(p.arg)) {
          p.arg.content = camelize(p.arg.content)
        }
        nonNameProps.push(p)
      }
    }
  }

  // 如果有非 name 属性，则构建插槽属性
  if (nonNameProps.length > 0) {
    const { props, directives } = buildProps(
      node,
      context,
      nonNameProps,
      false,
      false,
    )
    slotProps = props

    // 插槽出口不支持指令，如果有则报错
      if (directives.length) {
      context.onError(
        createCompilerError(
          ErrorCodes.X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET,
          directives[0].loc,
        ),
      )
    }
  }

  // 返回处理后的插槽名称和属性
  return {
    slotName,
    slotProps,
  }
}
