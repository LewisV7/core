/**
 * Vue 3 兼容性模块 - 属性透传处理
 * 用于判断在兼容性模式下哪些属性应该被跳过透传
 */
import { isOn } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import { DeprecationTypes, isCompatEnabled } from './compatConfig'

export function shouldSkipAttr(
  key: string,
  instance: ComponentInternalInstance,
): boolean {
  // 'is' 属性在 Vue 3 中已不再用于组件切换，需要跳过
  if (key === 'is') {
    return true
  }
  
  // 如果启用了 CLASS_STYLE 属性兼容性，跳过 'class' 和 'style' 属性
  if (
    (key === 'class' || key === 'style') &&
    isCompatEnabled(DeprecationTypes.INSTANCE_ATTRS_CLASS_STYLE, instance)
  ) {
    return true
  }
  
  // 如果启用了事件监听器兼容性，跳过事件属性
  if (
    isOn(key) &&
    isCompatEnabled(DeprecationTypes.INSTANCE_LISTENERS, instance)
  ) {
    return true
  }
  
  // 跳过与 vue-router 相关的特殊属性
  if (key.startsWith('routerView') || key === 'registerRouteInstance') {
    return true
  }
  
  // 其他属性不跳过
  return false
}
