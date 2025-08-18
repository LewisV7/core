/**
 * @file vShow.ts
 * @description 实现v-show指令的转换逻辑
 * 该模块将v-show指令转换为运行时的V_SHOW辅助函数调用
 */
import type { DirectiveTransform } from '@vue/compiler-core'
import { DOMErrorCodes, createDOMCompilerError } from '../errors'
import { V_SHOW } from '../runtimeHelpers'

/**
 * @function transformShow
 * @description 转换v-show指令
 * 将v-show指令转换为运行时的V_SHOW辅助函数调用
 * @param {Object} dir - 指令对象
 * @param {Object} node - AST节点
 * @param {Object} context - 转换上下文
 * @returns {Object} 转换结果，包含props和needRuntime
 */
export const transformShow: DirectiveTransform = (dir, node, context) => {
  // 解构指令对象，获取表达式和位置信息
  const { exp, loc } = dir
  
  // 检查是否提供了表达式，如果没有则报错
  if (!exp) {
    context.onError(
      createDOMCompilerError(DOMErrorCodes.X_V_SHOW_NO_EXPRESSION, loc),
    )
  }

  // 返回转换结果
  // props为空数组，因为v-show不生成DOM属性
  // needRuntime设置为V_SHOW辅助函数，表示需要运行时处理
  return {
    props: [],
    needRuntime: context.helper(V_SHOW),
  }
}
