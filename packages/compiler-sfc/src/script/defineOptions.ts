/*
 * Vue单文件组件defineOptions宏处理
 * 该模块负责解析和处理Vue组件中的defineOptions调用
 */
import type { Node } from '@babel/types' // 导入Babel类型定义
import { unwrapTSNode } from '@vue/compiler-dom' // 导入TS节点解包工具函数
import type { ScriptCompileContext } from './context' // 导入脚本编译上下文类型
import { isCallOf } from './utils' // 导入调用检测工具函数
import { DEFINE_PROPS } from './defineProps' // 导入defineProps常量
import { DEFINE_EMITS } from './defineEmits' // 导入defineEmits常量
import { DEFINE_EXPOSE } from './defineExpose' // 导入defineExpose常量
import { DEFINE_SLOTS } from './defineSlots' // 导入defineSlots常量

/**
 * defineOptions宏的标识符
 * @type {string}
 */
export const DEFINE_OPTIONS = 'defineOptions' // 定义defineOptions宏的常量标识符

/**
 * 处理defineOptions宏调用
 * @param {ScriptCompileContext} ctx - 脚本编译上下文
 * @param {Node} node - 要处理的AST节点
 * @returns {boolean} - 是否成功处理
 */
export function processDefineOptions(
  ctx: ScriptCompileContext,
  node: Node,
): boolean {
  // 检查是否是defineOptions函数调用
  if (!isCallOf(node, DEFINE_OPTIONS)) {
    return false
  }
  // 检查是否重复调用defineOptions
  if (ctx.hasDefineOptionsCall) {
    ctx.error(`重复的${DEFINE_OPTIONS}()调用`, node)
  }
  // 检查是否传入了类型参数
  if (node.typeParameters) {
    ctx.error(`${DEFINE_OPTIONS}()不能接受类型参数`, node)
  }
  if (!node.arguments[0]) return true

  // 标记已调用defineOptions
  ctx.hasDefineOptionsCall = true
  // 解包并保存选项运行时声明
  ctx.optionsRuntimeDecl = unwrapTSNode(node.arguments[0])

  // 初始化选项变量
  let propsOption = undefined
  let emitsOption = undefined
  let exposeOption = undefined
  let slotsOption = undefined
  // 检查是否是对象表达式
  if (ctx.optionsRuntimeDecl.type === 'ObjectExpression') {
    for (const prop of ctx.optionsRuntimeDecl.properties) {
      // 检查是否是有效的对象属性或方法
      if (
        (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
        prop.key.type === 'Identifier'
      ) {
        switch (prop.key.name) {
          // 检测props选项并报错，因为应该使用defineProps
          case 'props':
            propsOption = prop
            break

          // 检测emits选项并报错，因为应该使用defineEmits
          case 'emits':
            emitsOption = prop
            break

          // 检测expose选项并报错，因为应该使用defineExpose
          case 'expose':
            exposeOption = prop
            break

          // 检测slots选项并报错，因为应该使用defineSlots
          case 'slots':
            slotsOption = prop
            break
        }
      }
    }
  }

  // 如果检测到props选项，报错提示使用defineProps
  if (propsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}()不能用于声明props。请使用${DEFINE_PROPS}()代替。`,
      propsOption,
    )
  }
  // 如果检测到emits选项，报错提示使用defineEmits
  if (emitsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}()不能用于声明emits。请使用${DEFINE_EMITS}()代替。`,
      emitsOption,
    )
  }
  // 如果检测到expose选项，报错提示使用defineExpose
  if (exposeOption) {
    ctx.error(
      `${DEFINE_OPTIONS}()不能用于声明expose。请使用${DEFINE_EXPOSE}()代替。`,
      exposeOption,
    )
  }
  // 如果检测到slots选项，报错提示使用defineSlots
  if (slotsOption) {
    ctx.error(
      `${DEFINE_OPTIONS}()不能用于声明slots。请使用${DEFINE_SLOTS}()代替。`,
      slotsOption,
    )
  }

  return true
}
