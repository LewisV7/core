/**
 * DOM编译器中处理v-model指令的转换逻辑
 * 负责将v-model指令转换为适合不同DOM元素类型的运行时指令
 */
// 导入v-model相关的运行时辅助函数
import {
  // 指令转换函数类型
  type DirectiveTransform,
  // 元素类型枚举
  ElementTypes,
  // 节点类型枚举
  NodeTypes,
  // 基础v-model转换函数
  transformModel as baseTransform,
  // 查找指令工具函数
  findDir,
  // 查找属性工具函数
  findProp,
  // 检查是否有动态键绑定的工具函数
  hasDynamicKeyVBind,
  // 检查是否为静态参数的工具函数
  isStaticArgOf,
} from '@vue/compiler-core'
// 导入DOM编译错误相关常量和函数
import { DOMErrorCodes, createDOMCompilerError } from '../errors'
import {
  // 复选框类型的v-model指令
  V_MODEL_CHECKBOX,
  // 动态类型的v-model指令
  V_MODEL_DYNAMIC,
  // 单选按钮类型的v-model指令
  V_MODEL_RADIO,
  // 选择框类型的v-model指令
  V_MODEL_SELECT,
  // 文本类型的v-model指令
  V_MODEL_TEXT,
} from '../runtimeHelpers'

/**
 * 转换DOM元素上的v-model指令
 * @function transformModel
 * @description 将v-model指令转换为适合不同DOM元素类型（input、textarea、select等）的运行时指令
 * @param {DirectiveNode} dir - 指令节点
 * @param {ElementNode} node - 元素节点
 * @param {TransformContext} context - 转换上下文
 * @returns {DirectiveTransformResult} 转换结果
 */
export const transformModel: DirectiveTransform = (dir, node, context) => {
  // 调用基础转换函数处理v-model指令
  const baseResult = baseTransform(dir, node, context)
  // 检查基础转换是否有错误，或者是否是组件上的v-model（只需要props）
  // 组件上的v-model不需要额外处理，直接返回基础结果
  // 检查是否为支持v-model的元素（input、textarea、select或自定义元素）
  if (!baseResult.props.length || node.tagType === ElementTypes.COMPONENT) {
    return baseResult
  }

  // 检查v-model是否有参数（DOM元素上不允许）
  if (dir.arg) {
    context.onError(
      createDOMCompilerError(
        DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT,
        dir.arg.loc,
      ),
    )
  }

  // 检查是否存在重复的value绑定
  function checkDuplicatedValue() {
    const value = findDir(node, 'bind')
    if (value && isStaticArgOf(value.arg, 'value')) {
      context.onError(
        createDOMCompilerError(
          DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE,
          value.loc,
        ),
      )
    }
  }

  // 获取元素标签名
  const { tag } = node
  // 检查是否为自定义元素
  const isCustomElement = context.isCustomElement(tag)
  if (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    isCustomElement
  ) {
    // 默认使用文本类型的v-model指令
    let directiveToUse = V_MODEL_TEXT
    // 标记是否为无效类型（如file输入）
    let isInvalidType = false
    // 处理input元素或自定义元素
    if (tag === 'input' || isCustomElement) {
      // 查找type属性
      const type = findProp(node, `type`)
      // 如果存在type属性
      if (type) {
        // 动态type绑定（:type="xxx"）
        if (type.type === NodeTypes.DIRECTIVE) {
          // :type="foo"
          // 使用动态v-model指令
          // 使用动态v-model指令
        directiveToUse = V_MODEL_DYNAMIC
        // 静态type值
        } else if (type.value) {
          // 根据type值选择不同的v-model指令
          switch (type.value.content) {
            // 单选按钮类型
            case 'radio':
              // 使用单选按钮v-model指令
              directiveToUse = V_MODEL_RADIO
              break
            // 复选框类型
            case 'checkbox':
              // 使用复选框v-model指令
              directiveToUse = V_MODEL_CHECKBOX
              break
            // 文件输入类型（不支持v-model）
            case 'file':
              // 标记为无效类型
              isInvalidType = true
              context.onError(
                createDOMCompilerError(
                  DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT,
                  dir.loc,
                ),
              )
              break
            // 默认为文本类型
            default:
              // text type
              // 开发环境下检查重复的value绑定
              __DEV__ && checkDuplicatedValue()
              break
          }
        }
      // 元素有动态键绑定，可能包含type
      } else if (hasDynamicKeyVBind(node)) {
        // element has bindings with dynamic keys, which can possibly contain
        // "type".
        directiveToUse = V_MODEL_DYNAMIC
      // 没有type属性，默认为文本类型
      // 处理textarea元素
    // 不支持v-model的元素
  } else {
        // text type
        __DEV__ && checkDuplicatedValue()
      }
    // 处理select元素
    } else if (tag === 'select') {
      // 使用select类型v-model指令
      directiveToUse = V_MODEL_SELECT
    } else {
      // textarea
      __DEV__ && checkDuplicatedValue()
    }
    // 注入运行时指令
    // 通过返回helper symbol，import将被替换为resolveDirective调用
    // by returning the helper symbol via needRuntime
    // the import will replaced a resolveDirective call.
    // 如果不是无效类型
    if (!isInvalidType) {
      // 设置需要的运行时指令
      baseResult.needRuntime = context.helper(directiveToUse)
    }
  } else {
    context.onError(
      createDOMCompilerError(
        DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT,
        dir.loc,
      ),
    )
  }

  // 原生v-model不需要`modelValue` props，因为它们也会作为`binding.value`传递给运行时
  // 删除它可以减小代码大小
  // passed to the runtime as `binding.value`. removing it reduces code size.
  // 过滤掉modelValue prop
  baseResult.props = baseResult.props.filter(
    p =>
      !(
        p.key.type === NodeTypes.SIMPLE_EXPRESSION &&
        p.key.content === 'modelValue'
      ),
  )

  return baseResult
}
