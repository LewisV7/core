/**
 * @file validateHtmlNesting.ts
 * @description 验证HTML元素嵌套的合法性
 * 该模块实现了对HTML元素嵌套关系的验证，确保元素符合HTML规范中的嵌套规则
 * 避免可能导致 hydration 错误或功能异常的非法嵌套
 */
import {
  type CompilerError,
  ElementTypes,
  type NodeTransform,
  NodeTypes,
} from '@vue/compiler-core'
import { isValidHTMLNesting } from '../htmlNesting'

/**
 * @function validateHtmlNesting
 * @description 验证HTML元素嵌套的合法性
 * @param {Node} node - 要验证的AST节点
 * @param {TransformContext} context - 转换上下文
 * @returns {void} - 无返回值，仅在发现非法嵌套时发出警告
 */
export const validateHtmlNesting: NodeTransform = (node, context) => {
  // 检查节点和父节点是否均为HTML元素，以及是否存在非法嵌套
  if (
    node.type === NodeTypes.ELEMENT &&
    node.tagType === ElementTypes.ELEMENT &&
    context.parent &&
    context.parent.type === NodeTypes.ELEMENT &&
    context.parent.tagType === ElementTypes.ELEMENT &&
    !isValidHTMLNesting(context.parent.tag, node.tag)
  ) {
    // 创建语法错误对象，包含非法嵌套的详细信息
    const error = new SyntaxError(
      `<${node.tag}> 不能作为 <${context.parent.tag}> 的子元素，` +
        '根据HTML规范。这可能导致hydration错误或' +
        '潜在地破坏未来的功能。',
    ) as CompilerError
    // 设置错误的位置信息
    error.loc = node.loc
    // 发出警告
    context.onWarn(error)
  }
}
