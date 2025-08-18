/**
 * @file 运行时辅助函数定义
 * @description 该模块定义了DOM编译器使用的运行时辅助函数标识符，并注册到编译器核心
 */
import { registerRuntimeHelpers } from '@vue/compiler-core'

/**
 * 单选框v-model绑定辅助函数
 * @description 用于处理单选按钮的v-model指令
 */
export const V_MODEL_RADIO: unique symbol = Symbol(__DEV__ ? `vModelRadio` : ``)
/**
 * 复选框v-model绑定辅助函数
 * @description 用于处理复选框的v-model指令
 */
export const V_MODEL_CHECKBOX: unique symbol = Symbol(
  __DEV__ ? `vModelCheckbox` : ``,
)
/**
 * 文本输入v-model绑定辅助函数
 * @description 用于处理文本输入框的v-model指令
 */
export const V_MODEL_TEXT: unique symbol = Symbol(__DEV__ ? `vModelText` : ``)
/**
 * 选择框v-model绑定辅助函数
 * @description 用于处理下拉选择框的v-model指令
 */
export const V_MODEL_SELECT: unique symbol = Symbol(
  __DEV__ ? `vModelSelect` : ``,
)
/**
 * 动态v-model绑定辅助函数
 * @description 用于处理动态类型表单元素的v-model指令
 */
export const V_MODEL_DYNAMIC: unique symbol = Symbol(
  __DEV__ ? `vModelDynamic` : ``,
)

/**
 * 带修饰符的事件处理辅助函数
 * @description 用于处理带有修饰符的v-on指令
 */
export const V_ON_WITH_MODIFIERS: unique symbol = Symbol(
  __DEV__ ? `vOnModifiersGuard` : ``,
)
/**
 * 带按键修饰符的事件处理辅助函数
 * @description 用于处理带有按键修饰符的v-on指令
 */
export const V_ON_WITH_KEYS: unique symbol = Symbol(
  __DEV__ ? `vOnKeysGuard` : ``,
)

/**
 * 条件显示辅助函数
 * @description 用于处理v-show指令，控制元素的显示与隐藏
 */
export const V_SHOW: unique symbol = Symbol(__DEV__ ? `vShow` : ``)

/**
 * 过渡动画组件
 * @description 用于处理元素过渡动画的内置组件
 */
export const TRANSITION: unique symbol = Symbol(__DEV__ ? `Transition` : ``)
/**
 * 过渡组动画组件
 * @description 用于处理一组元素过渡动画的内置组件
 */
export const TRANSITION_GROUP: unique symbol = Symbol(
  __DEV__ ? `TransitionGroup` : ``,
)

/**
 * 注册运行时辅助函数
 * @description 将DOM编译器的运行时辅助函数注册到编译器核心
 */
registerRuntimeHelpers({
  [V_MODEL_RADIO]: `vModelRadio`,
  [V_MODEL_CHECKBOX]: `vModelCheckbox`,
  [V_MODEL_TEXT]: `vModelText`,
  [V_MODEL_SELECT]: `vModelSelect`,
  [V_MODEL_DYNAMIC]: `vModelDynamic`,
  [V_ON_WITH_MODIFIERS]: `withModifiers`,
  [V_ON_WITH_KEYS]: `withKeys`,
  [V_SHOW]: `vShow`,
  [TRANSITION]: `Transition`,
  [TRANSITION_GROUP]: `TransitionGroup`,
})
