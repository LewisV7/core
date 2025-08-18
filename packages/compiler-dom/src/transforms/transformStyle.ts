/**
 * @file transformStyle.ts
 * @description 处理DOM元素style属性的转换
 * 该模块将静态style属性转换为动态的:style绑定，以便在运行时进行处理
 */
import {
  ConstantTypes,
  type NodeTransform,
  NodeTypes,
  type SimpleExpressionNode,
  type SourceLocation,
  createSimpleExpression,
} from '@vue/compiler-core'
import { parseStringStyle } from '@vue/shared'

/**
 * @function transformStyle
 * @description 转换DOM元素的style属性
 * 将静态style属性转换为动态的:style绑定
 * @param {Object} node - AST节点
 * @returns {void} 无返回值，直接修改节点
 * @example
 * // 转换前
 * <div style="color: red"></div>
 * // 转换后
 * <div :style="{ 'color': 'red' }"></div>
 */
export const transformStyle: NodeTransform = node => {
  // 检查节点是否为元素节点
  if (node.type === NodeTypes.ELEMENT) {
    // 遍历元素的所有属性
    node.props.forEach((p, i) => {
      // 查找静态style属性
      if (p.type === NodeTypes.ATTRIBUTE && p.name === 'style' && p.value) {
        // 替换为表达式节点
        node.props[i] = {
          type: NodeTypes.DIRECTIVE,
          name: `bind`,
          arg: createSimpleExpression(`style`, true, p.loc),
          // 解析CSS文本并创建表达式
          exp: parseInlineCSS(p.value.content, p.loc),
          modifiers: [],
          loc: p.loc,
        }
      }
    })
  }
}

/**
 * @function parseInlineCSS
 * @description 解析内联CSS字符串
 * 将CSS文本解析为对象并创建简单表达式节点
 * @param {string} cssText - CSS文本字符串
 * @param {Object} loc - 源代码位置信息
 * @returns {SimpleExpressionNode} 简单表达式节点
 */
const parseInlineCSS = (
  cssText: string,
  loc: SourceLocation,
): SimpleExpressionNode => {
  // 使用共享工具函数解析CSS文本为对象
  const normalized = parseStringStyle(cssText)
  
  // 创建简单表达式节点
  return createSimpleExpression(
    // 将解析后的CSS对象转换为字符串
    JSON.stringify(normalized),
    false,
    loc,
    // 标记为可字符串化的常量
    ConstantTypes.CAN_STRINGIFY,
  )
}
