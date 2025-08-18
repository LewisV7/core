/**
 * 计算属性 API
 * 封装了 @vue/reactivity 中的 computed 函数，添加了开发环境下的递归警告支持
 */
import { type ComputedRefImpl, computed as _computed } from '@vue/reactivity'
import { getCurrentInstance, isInSSRComponentSetup } from './component'

export const computed: typeof _computed = (
  getterOrOptions: any,
  debugOptions?: any,
) => {
  // 调用原始的 computed 函数，传入参数和 SSR 标志
  // @ts-expect-error
  const c = _computed(getterOrOptions, debugOptions, isInSSRComponentSetup)
  
  // 在开发环境下，如果配置了递归警告，则启用它
  if (__DEV__) {
    // 获取当前组件实例
    const i = getCurrentInstance()
    // 检查实例是否存在以及是否启用了递归计算警告
    if (i && i.appContext.config.warnRecursiveComputed) {
      // 设置计算属性的递归警告标志
      ;(c as unknown as ComputedRefImpl<any>)._warnRecursive = true
    }
  }
  
  // 返回创建的计算属性
  return c as any
}
