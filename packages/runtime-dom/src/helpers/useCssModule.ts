/**
 * 访问组件的CSS模块
 * @param {string} [name='$style'] - CSS模块的名称，默认为'$style'
 * @returns {Record<string, string>} CSS模块对象，包含类名到哈希类名的映射
 * @throws {Error} 当在非组件上下文中调用时会抛出警告
 *
 * 该函数用于在组件的setup函数中访问CSS模块。CSS模块会将类名转换为唯一的哈希值，
 * 避免样式冲突。通过此函数可以获取到转换后的类名映射。
 */
import { getCurrentInstance, warn } from '@vue/runtime-core'
import { EMPTY_OBJ } from '@vue/shared'

export function useCssModule(name = '$style'): Record<string, string> {
  // 非全局模式下的处理
  if (!__GLOBAL__) {
    // 获取当前组件实例
    const instance = getCurrentInstance()!

    // 检查实例是否存在（确保在setup函数中调用）
    if (!instance) {
      __DEV__ && warn(`useCssModule 必须在 setup() 中调用`)
      return EMPTY_OBJ
    }

    // 获取注入的CSS模块
    const modules = instance.type.__cssModules

    // 检查是否存在CSS模块
    if (!modules) {
      __DEV__ && warn(`当前实例没有注入CSS模块`)
      return EMPTY_OBJ
    }

    // 获取指定名称的CSS模块
    const mod = modules[name]

    // 检查指定名称的CSS模块是否存在
    if (!mod) {
      __DEV__ &&
        warn(`当前实例没有名为 "${name}" 的CSS模块`)
      return EMPTY_OBJ
    }

    // 返回CSS模块
    return mod as Record<string, string>
  } else {
    /* v8 ignore start */
    // 全局模式下不支持useCssModule
    if (__DEV__) {
      warn(`全局构建版本不支持 useCssModule()`)
    }
    return EMPTY_OBJ
    /* v8 ignore stop */
  }
}
