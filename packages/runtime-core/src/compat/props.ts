/**
 * Vue 2 兼容性模块 - Props 默认值处理
 *
 * 此模块提供了在 Vue 3 兼容模式下处理 Vue 2 风格 props 默认值的功能。
 * 主要用于模拟 props 默认值函数中的 `this` 上下文，以支持旧版代码。
 */
import { isArray } from '@vue/shared'
import { inject } from '../apiInject'
import type { ComponentInternalInstance, Data } from '../component'
import {
  type ComponentOptions,
  resolveMergedOptions,
} from '../componentOptions'
import { DeprecationTypes, warnDeprecation } from './compatConfig'

/**
 * 创建一个模拟 Vue 2 中 props 默认值函数的 `this` 上下文的代理对象
 *
 * @param {ComponentInternalInstance} instance - 组件内部实例
 * @param {Data} rawProps - 原始 props 数据
 * @param {string} propKey - 当前处理的 prop 键名
 * @returns {object} - 代理对象，用于模拟 `this` 上下文
 */
export function createPropsDefaultThis(
  instance: ComponentInternalInstance,
  rawProps: Data,
  propKey: string,
): object {
  return new Proxy(
    {},
    {
      get(_, key: string) {
        // 在开发环境下发出弃用警告
        __DEV__ &&
          warnDeprecation(DeprecationTypes.PROPS_DEFAULT_THIS, null, propKey)

        // 处理 $options 属性访问
        if (key === '$options') {
          return resolveMergedOptions(instance)
        }

        // 处理 props 属性访问
        if (key in rawProps) {
          return rawProps[key]
        }

        // 处理注入的属性访问
        const injections = (instance.type as ComponentOptions).inject
        if (injections) {
          if (isArray(injections)) {
            if (injections.includes(key)) {
              return inject(key)
            }
          } else if (key in injections) {
            return inject(key)
          }
        }
      },
    },
  )
}
