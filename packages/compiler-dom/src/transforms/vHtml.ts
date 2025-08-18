/**
 * @file vHtml.ts
 * @description 实现v-html指令的转换逻辑
 * 该模块将v-html指令转换为DOM元素的innerHTML属性绑定
 */
import {
  type DirectiveTransform,
  createObjectProperty,
  createSimpleExpression,
} from '@vue/compiler-core'
import { DOMErrorCodes, createDOMCompilerError } from '../errors'

/**
 * @function transformVHtml
 * @description 转换v-html指令
 * 将v-html指令转换为DOM元素的innerHTML属性绑定
 * @param {Object} dir - 指令对象
 * @param {Object} node - AST节点
 * @param {Object} context - 转换上下文
 * @returns {Object} 转换结果，包含props数组
 */
export const transformVHtml: DirectiveTransform = (dir, node, context) => {
  // 解构指令对象，获取表达式和位置信息
  const { exp, loc } = dir
  
  // 检查是否提供了表达式，如果没有则报错
  if (!exp) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_HTML_NO_EXPRESSION, loc),
    )
  }
  
  // 检查元素是否有子节点，如果有则报错并清空子节点
  if (node.children.length) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_HTML_WITH_CHILDREN, loc),
    )
    node.children.length = 0
  }
  
  // 返回转换结果
  return {
    props: [
      // 创建innerHTML属性绑定
      createObjectProperty(
        createSimpleExpression(`innerHTML`, true, loc),
        // 使用表达式或空字符串作为属性值
        exp || createSimpleExpression('', true),
      ),
    ],
  }
}
