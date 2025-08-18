/**
 * @file Transition.ts
 * @description 处理DOM元素中过渡组件(transition)的转换逻辑
 * 该模块实现了对Vue内置<transition>组件的编译转换，包括子节点验证和v-show指令处理
 */
import {
  type ComponentNode,
  ElementTypes,
  type IfBranchNode,
  type NodeTransform,
  NodeTypes,
} from '@vue/compiler-core'
import { TRANSITION } from '../runtimeHelpers'
import { DOMErrorCodes, createDOMCompilerError } from '../errors'

/**
 * @function transformTransition
 * @description 处理过渡组件(transition)的转换逻辑
 * @param {Node} node - 要转换的AST节点
 * @param {TransformContext} context - 转换上下文
 * @returns {Function|void} - 可能返回一个延迟执行的转换函数
 */
export const transformTransition: NodeTransform = (node, context) => {
  // 检查节点是否为元素节点且是组件类型
  if (
    node.type === NodeTypes.ELEMENT &&
    node.tagType === ElementTypes.COMPONENT
  ) {
    // 检查是否是内置组件
    const component = context.isBuiltInComponent(node.tag)
    // 如果是transition组件
      if (component === TRANSITION) {
      // 返回延迟执行的转换函数
        return () => {
        // 如果没有子节点则直接返回
          if (!node.children.length) {
          return
        }

        // 检查是否有多个有效子节点，如果有则报错
          if (hasMultipleChildren(node)) {
          context.onError(
            createDOMCompilerError(
              DOMErrorCodes.X_TRANSITION_INVALID_CHILDREN,
              {
                start: node.children[0].loc.start,
                end: node.children[node.children.length - 1].loc.end,
                source: '',
              },
            ),
          )
        }

        // check if it's s single child w/ v-show
        // if yes, inject "persisted: true" to the transition props
        // 获取第一个子节点
          const child = node.children[0]
        // 检查子节点是否为元素节点
            if (child.type === NodeTypes.ELEMENT) {
          // 遍历子节点的所有属性
              for (const p of child.props) {
            if (p.type === NodeTypes.DIRECTIVE && p.name === 'show') {
              node.props.push({
                type: NodeTypes.ATTRIBUTE,
                name: 'persisted',
                nameLoc: node.loc,
                value: undefined,
                loc: node.loc,
              })
            }
          }
        }
      }
    }
  }
}

/**
 * @function hasMultipleChildren
 * @description 检查过渡组件是否有多个有效子节点
 * @param {ComponentNode|IfBranchNode} node - 要检查的节点
 * @returns {boolean} - 如果有多个有效子节点则返回true，否则返回false
 */
function hasMultipleChildren(node: ComponentNode | IfBranchNode): boolean {
  // 过滤掉注释节点和空文本节点
  const children = (node.children = node.children.filter(
    c =>
      c.type !== NodeTypes.COMMENT &&
      !(c.type === NodeTypes.TEXT && !c.content.trim()),
  ))
  // 获取第一个有效子节点
  const child = children[0]
  // 判断是否有多个有效子节点
  // 条件1: 子节点数量不等于1
  // 条件2: 唯一子节点是for循环
  // 条件3: 唯一子节点是if语句且其分支中有多个子节点
  return (
    children.length !== 1 ||
    child.type === NodeTypes.FOR ||
    (child.type === NodeTypes.IF && child.branches.some(hasMultipleChildren))
  )
}
