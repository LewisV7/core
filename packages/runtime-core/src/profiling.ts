/**
 * 性能分析工具模块
 * 提供组件渲染和更新性能测量功能，集成浏览器Performance API和devtools
 */
/* eslint-disable no-restricted-globals */
import {
  type ComponentInternalInstance,
  formatComponentName,
} from './component'
import { devtoolsPerfEnd, devtoolsPerfStart } from './devtools'

/** 是否支持性能分析API */
let supported: boolean
/** 浏览器Performance对象引用 */
let perf: Performance

/**
 * 开始性能测量
 * @param instance 组件内部实例
 * @param type 测量类型（如'mount'、'update'等）
 */
export function startMeasure(
  instance: ComponentInternalInstance,
  type: string,
): void {
  if (instance.appContext.config.performance && isSupported()) {
    // 在性能时间轴上标记开始点
perf.mark(`vue-${type}-${instance.uid}`)
  }

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    // 通知devtools开始性能测量
    devtoolsPerfStart(instance, type, isSupported() ? perf.now() : Date.now())
  }
}

/**
 * 结束性能测量并记录结果
 * @param instance 组件内部实例
 * @param type 测量类型（如'mount'、'update'等）
 */
export function endMeasure(
  instance: ComponentInternalInstance,
  type: string,
): void {
  if (instance.appContext.config.performance && isSupported()) {
    const startTag = `vue-${type}-${instance.uid}`
    const endTag = startTag + `:end`
    const measureName = `<${formatComponentName(instance, instance.type)}> ${type}`
    // 在性能时间轴上标记结束点
    perf.mark(endTag)
    // 测量从开始到结束的时间差
    perf.measure(measureName, startTag, endTag)
    // 清理测量和标记以避免内存泄漏
    perf.clearMeasures(measureName)
    perf.clearMarks(startTag)
    perf.clearMarks(endTag)
  }

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    // 通知devtools结束性能测量
    devtoolsPerfEnd(instance, type, isSupported() ? perf.now() : Date.now())
  }
}

/**
 * 检查环境是否支持性能分析API
 * @returns 如果支持返回true，否则返回false
 */
function isSupported() {
  if (supported !== undefined) {
    return supported
  }
  if (typeof window !== 'undefined' && window.performance) {
    supported = true
    perf = window.performance
  } else {
    supported = false
  }
  return supported
}
