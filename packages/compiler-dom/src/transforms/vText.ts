/**
 * @file v-text指令转换
 * @description 该模块实现了v-text指令的转换逻辑，将v-text指令转换为DOM的textContent属性
 */
import {
  type DirectiveTransform,
  TO_DISPLAY_STRING,
  createCallExpression,
  createObjectProperty,
  createSimpleExpression,
  getConstantType,
} from '@vue/compiler-core'
import { DOMErrorCodes, createDOMCompilerError } from '../errors'

/**
 * v-text指令转换函数
 * @description 将v-text指令转换为DOM元素的textContent属性
 * @param {Object} dir - 指令对象，包含表达式等信息
 * @param {Object} node - 当前AST节点
 * @param {Object} context - 转换上下文
 * @returns {Object} 转换结果，包含要添加的属性
 */
export const transformVText: DirectiveTransform = (dir, node, context) => {
  // 解构指令对象，获取表达式和位置信息
  const { exp, loc } = dir

  // 检查是否提供了表达式，如果没有则报错
  if (!exp) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_TEXT_NO_EXPRESSION, loc),
    )
  }

  // 检查元素是否有子节点，如果有则报错并清空子节点
  if (node.children.length) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_TEXT_WITH_CHILDREN, loc),
    )
    node.children.length = 0
  }

  // 返回转换结果
  return {
    props: [
      // 创建textContent属性
      createObjectProperty(
        createSimpleExpression(`textContent`, true),
        // 处理表达式：如果是常量则直接使用，否则使用TO_DISPLAY_STRING转换
        exp
          ? getConstantType(exp, context) > 0
            ? exp
            : createCallExpression(
                context.helperString(TO_DISPLAY_STRING),
                [exp],
                loc,
              )
          : createSimpleExpression('', true),
      ),
    ],
  }
}
