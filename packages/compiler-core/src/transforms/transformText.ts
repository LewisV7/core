/**
 * 文本转换模块
 * 此模块负责合并相邻的文本节点和表达式，并将它们转换为 createTextVNode 调用
 */
import type { NodeTransform } from '../transform'
import {
  type CallExpression,
  type CompoundExpressionNode,
  ConstantTypes,
  ElementTypes,
  NodeTypes,
  createCallExpression,
  createCompoundExpression,
} from '../ast'
import { isText } from '../utils'
import { CREATE_TEXT } from '../runtimeHelpers'
import { PatchFlagNames, PatchFlags } from '@vue/shared'
import { getConstantType } from './cacheStatic'

/**
 * 转换文本节点和表达式
 * 合并相邻的文本节点和表达式为单个表达式，并将文本节点转换为 createTextVNode 调用
 * @param {Node} node - 要转换的 AST 节点
 * @param {TransformContext} context - 转换上下文
 * @returns {Function|void} 节点退出时执行的函数或无返回值
 *
 * 示例：
 * <div>abc {{ d }} {{ e }}</div> 会被转换为一个单一的表达式节点作为子节点
 */
export const transformText: NodeTransform = (node, context) => {
  // 仅处理根节点、元素节点、for节点和if分支节点
  if (
    node.type === NodeTypes.ROOT ||
    node.type === NodeTypes.ELEMENT ||
    node.type === NodeTypes.FOR ||
    node.type === NodeTypes.IF_BRANCH
  ) {
    // 在节点退出时执行转换，确保所有表达式都已被处理
    return () => {
      const children = node.children
      let currentContainer: CompoundExpressionNode | undefined = undefined
      let hasText = false

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child)) {
          hasText = true
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j]
            if (isText(next)) {
              if (!currentContainer) {
                currentContainer = children[i] = createCompoundExpression(
                  [child],
                  child.loc,
                )
              }
              // merge adjacent text node into current
              currentContainer.children.push(` + `, next)
              children.splice(j, 1)
              j--
            } else {
              currentContainer = undefined
              break
            }
          }
        }
      }

      // 如果没有文本节点，或者是只有一个文本子节点的普通元素，则不进行转换
      // 运行时对这种情况有专门的优化路径，直接设置元素的textContent
      if (!hasText ||
        (children.length === 1 &&
          (node.type === NodeTypes.ROOT ||
            (node.type === NodeTypes.ELEMENT &&
              node.tagType === ElementTypes.ELEMENT &&
              // #3756
              // 自定义指令可能会任意添加DOM元素，我们需要避免在运行时设置元素的textContent
              // 以防止意外覆盖用户通过自定义指令添加的DOM元素
              !node.props.find(
                p =>
                  p.type === NodeTypes.DIRECTIVE &&
                  !context.directiveTransforms[p.name],
              ) &&
              // 在兼容模式下，没有特殊指令的<template>标签将被渲染为片段，因此其子节点必须转换为vnodes
              !(__COMPAT__ && node.tag === 'template'))))
      ) {
        return
      }

      // 预先将文本节点转换为 createTextVNode(text) 调用，以避免运行时归一化
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child) || child.type === NodeTypes.COMPOUND_EXPRESSION) {
          const callArgs: CallExpression['arguments'] = []
          // createTextVNode defaults to single whitespace, so if it is a
          // single space the code could be an empty call to save bytes.
          if (child.type !== NodeTypes.TEXT || child.content !== ' ') {
            callArgs.push(child)
          }
          // mark dynamic text with flag so it gets patched inside a block
          if (
            !context.ssr &&
            getConstantType(child, context) === ConstantTypes.NOT_CONSTANT
          ) {
            callArgs.push(
              PatchFlags.TEXT +
                (__DEV__ ? ` /* ${PatchFlagNames[PatchFlags.TEXT]} */` : ``),
            )
          }
          children[i] = {
            type: NodeTypes.TEXT_CALL,
            content: child,
            loc: child.loc,
            codegenNode: createCallExpression(
              context.helper(CREATE_TEXT),
              callArgs,
            ),
          }
        }
      }
    }
  }
}
