/**
 * 资源解析工具
 * 负责解析组件、指令和过滤器等资源
 * 支持局部注册和全局注册的资源解析
 */
import {
  type ComponentOptions,
  type ConcreteComponent,
  currentInstance,
  getComponentName,
} from '../component'
import { currentRenderingInstance } from '../componentRenderContext'
import type { Directive } from '../directives'
import { camelize, capitalize, isString } from '@vue/shared'
import { warn } from '../warning'
import type { VNodeTypes } from '../vnode'

/** 组件资源类型标识 */
export const COMPONENTS = 'components'
/** 指令资源类型标识 */
export const DIRECTIVES = 'directives'
/** 过滤器资源类型标识 (仅用于v2兼容) */
export const FILTERS = 'filters'

/** 资源类型联合类型 */
export type AssetTypes = typeof COMPONENTS | typeof DIRECTIVES | typeof FILTERS

/**
 * 解析组件
 * @param name 组件名称
 * @param maybeSelfReference 是否可能是自引用
 * @returns 解析到的组件或组件名称
 * @private
 */
export function resolveComponent(
  name: string,
  maybeSelfReference?: boolean,
): ConcreteComponent | string {
  return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name
}

/** 无效动态组件标识 */
export const NULL_DYNAMIC_COMPONENT: unique symbol = Symbol.for('v-ndc')

/**
 * 解析动态组件
 * @param component 组件引用，可以是字符串或组件对象
 * @returns 解析到的组件或NULL_DYNAMIC_COMPONENT
 * @private
 */
export function resolveDynamicComponent(component: unknown): VNodeTypes {
  if (isString(component)) {
    return resolveAsset(COMPONENTS, component, false) || component
  } else {
    // invalid types will fallthrough to createVNode and raise warning
    return (component || NULL_DYNAMIC_COMPONENT) as any
  }
}

/**
 * 解析指令
 * @param name 指令名称
 * @returns 解析到的指令或undefined
 * @private
 */
export function resolveDirective(name: string): Directive | undefined {
  return resolveAsset(DIRECTIVES, name)
}

/**
 * 解析过滤器 (仅用于v2兼容)
 * @param name 过滤器名称
 * @returns 解析到的过滤器函数或undefined
 * @internal
 */
export function resolveFilter(name: string): Function | undefined {
  return resolveAsset(FILTERS, name)
}

/**
 * 解析资源的核心函数
 * 支持解析组件、指令和过滤器
 * @param type 资源类型
 * @param name 资源名称
 * @param warnMissing 是否在未找到时发出警告
 * @param maybeSelfReference 是否可能是自引用
 * @returns 解析到的资源或undefined
 * @private
 * overload 1: components
 */
function resolveAsset(
  type: typeof COMPONENTS,
  name: string,
  warnMissing?: boolean,
  maybeSelfReference?: boolean,
): ConcreteComponent | undefined
// overload 2: directives
function resolveAsset(
  type: typeof DIRECTIVES,
  name: string,
): Directive | undefined
// implementation
// overload 3: filters (compat only)
function resolveAsset(type: typeof FILTERS, name: string): Function | undefined
// implementation
function resolveAsset(
  type: AssetTypes,
  name: string,
  warnMissing = true,
  maybeSelfReference = false,
) {
  const instance = currentRenderingInstance || currentInstance
  if (instance) {
    const Component = instance.type

    // explicit self name has highest priority
    if (type === COMPONENTS) {
      const selfName = getComponentName(
        Component,
        false /* do not include inferred name to avoid breaking existing code */,
      )
      if (
        selfName &&
        (selfName === name ||
          selfName === camelize(name) ||
          selfName === capitalize(camelize(name)))
      ) {
        return Component
      }
    }

    const res =
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type] || (Component as ComponentOptions)[type], name) ||
      // global registration
      resolve(instance.appContext[type], name)

    if (!res && maybeSelfReference) {
      // fallback to implicit self-reference
      return Component
    }

    if (__DEV__ && warnMissing && !res) {
      const extra =
        type === COMPONENTS
          ? `\nIf this is a native custom element, make sure to exclude it from ` +
            `component resolution via compilerOptions.isCustomElement.`
          : ``
      warn(`Failed to resolve ${type.slice(0, -1)}: ${name}${extra}`)
    }

    return res
  } else if (__DEV__) {
    warn(
      `resolve${capitalize(type.slice(0, -1))} ` +
        `can only be used in render() or setup().`,
    )
  }
}

/**
 * 在注册表中解析资源
 * 支持按原始名称、驼峰式名称和首字母大写的驼峰式名称查找
 * @param registry 资源注册表
 * @param name 资源名称
 * @returns 解析到的资源或undefined
 */
function resolve(registry: Record<string, any> | undefined, name: string) {
  return (
    registry &&
    (registry[name] ||
      registry[camelize(name)] ||
      registry[capitalize(camelize(name))])
  )
}
