/**
 * Vue 特性标志初始化模块
 * 负责设置和验证编译时特性标志，这些标志控制Vue运行时的各种功能
 */
import { getGlobalThis } from '@vue/shared'

/**
 * 初始化特性标志
 * 仅在esm-bundler构建中被调用
 * 在`baseCreateRenderer`创建渲染器时调用，以确保导入runtime-core是无副作用的
 */
export function initFeatureFlags(): void {
  // 存储需要警告的未定义特性标志
  const needWarn = []

  // 检查Options API特性标志是否定义
  if (typeof __FEATURE_OPTIONS_API__ !== 'boolean') {
    // 开发环境下添加警告
    __DEV__ && needWarn.push(`__VUE_OPTIONS_API__`)
    // 默认启用Options API
    getGlobalThis().__VUE_OPTIONS_API__ = true
  }

  // 检查生产环境DevTools特性标志是否定义
  if (typeof __FEATURE_PROD_DEVTOOLS__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_PROD_DEVTOOLS__`)
    // 默认禁用生产环境DevTools
    getGlobalThis().__VUE_PROD_DEVTOOLS__ = false
  }

  // 检查生产环境水合不匹配详情特性标志是否定义
  if (typeof __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`)
    // 默认禁用生产环境水合不匹配详情
    getGlobalThis().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false
  }

  // 如果有未定义的特性标志，在开发环境下发出警告
  if (__DEV__ && needWarn.length) {
    const multi = needWarn.length > 1
    console.warn(
      `特性标志${multi ? `s` : ``} ${needWarn.join(', ')} ${
        multi ? `未` : `未`
      }被明确定义。您正在运行Vue的esm-bundler构建，` +
        `该构建期望这些编译时特性标志通过打包器配置全局注入，` +
        `以便在生产包中获得更好的树摇效果。\n\n` +
        `更多详情，请参阅 https://link.vuejs.org/feature-flags。`,
    )
  }
}
