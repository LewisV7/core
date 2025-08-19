/**
 * Vue 3 核心模块 - 组件事件发射系统
 * 该模块负责处理组件事件的定义、验证和触发机制
 */
import {
  EMPTY_OBJ,
  type OverloadParameters,
  type UnionToIntersection,
  camelize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isFunction,
  isObject,
  isOn,
  isString,
  looseToNumber,
  toHandlerKey,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  formatComponentName,
} from './component'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import { warn } from './warning'
import { devtoolsComponentEmit } from './devtools'
import type { AppContext } from './apiCreateApp'
import { emit as compatInstanceEmit } from './compat/instanceEventEmitter'
import {
  compatModelEmit,
  compatModelEventPrefix,
} from './compat/componentVModel'
import type { ComponentTypeEmits } from './apiSetupHelpers'
import { getModelModifiers } from './helpers/useModel'
import type { ComponentPublicInstance } from './componentPublicInstance'

/**
 * 对象形式的事件选项定义
 * 键为事件名称，值为事件验证函数或 null
 */
export type ObjectEmitsOptions = Record<
  string,
  ((...args: any[]) => any) | null
>

/**
 * 事件选项定义，可以是对象形式或字符串数组形式
 */
export type EmitsOptions = ObjectEmitsOptions | string[]

/**
 * 将事件选项转换为对应的 props 类型
 * 根据事件选项生成对应的事件处理函数 props 类型
 */
export type EmitsToProps<T extends EmitsOptions | ComponentTypeEmits> =
  T extends string[]
    ? {
        [K in `on${Capitalize<T[number]>}`]?: (...args: any[]) => any
      }
    : T extends ObjectEmitsOptions
      ? {
          [K in string & keyof T as `on${Capitalize<K>}`]?: (
            ...args: T[K] extends (...args: infer P) => any
              ? P
              : T[K] extends null
                ? any[]
                : never
          ) => any
        }
      : {}

/**
 * 将类型化的 emits 转换为事件选项
 * 用于将运行时 emits 类型转换为组件选项中的 emits 格式
 */
export type TypeEmitsToOptions<T extends ComponentTypeEmits> = {
  [K in keyof T & string]: T[K] extends [...args: infer Args]
    ? (...args: Args) => any
    : () => any
} & (T extends (...args: any[]) => any
  ? ParametersToFns<OverloadParameters<T>>
  : {})

type ParametersToFns<T extends any[]> = {
  [K in T[0]]: IsStringLiteral<K> extends true
    ? (
        ...args: T extends [e: infer E, ...args: infer P]
          ? K extends E
            ? P
            : never
          : never
      ) => any
    : never
}

type IsStringLiteral<T> = T extends string
  ? string extends T
    ? false
    : true
  : false

/**
 * 将简写形式的 emits 转换为对象形式
 * 用于处理不同格式的 emits 定义
 */
export type ShortEmitsToObject<E> =
  E extends Record<string, any[]>
    ? {
        [K in keyof E]: (...args: E[K]) => any
      }
    : E

/**
 * 事件发射函数类型
 * 根据提供的事件选项自动推断事件名称和参数类型
 */
export type EmitFn<
  Options = ObjectEmitsOptions,
  Event extends keyof Options = keyof Options,
> =
  Options extends Array<infer V>
    ? (event: V, ...args: any[]) => void
    : {} extends Options // if the emit is empty object (usually the default value for emit) should be converted to function
      ? (event: string, ...args: any[]) => void
      : UnionToIntersection<
          {
            [key in Event]: Options[key] extends (...args: infer Args) => any
              ? (event: key, ...args: Args) => void
              : Options[key] extends any[]
                ? (event: key, ...args: Options[key]) => void
                : (event: key, ...args: any[]) => void
          }[Event]
        >

/**
 * 触发组件事件
 * @param instance 组件内部实例
 * @param event 事件名称
 * @param rawArgs 事件参数
 * @returns 组件公共实例或 null 或 undefined
 */
export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...rawArgs: any[]
): ComponentPublicInstance | null | undefined {
  // 如果组件已卸载，则不触发事件
if (instance.isUnmounted) return
  const props = instance.vnode.props || EMPTY_OBJ

  // 开发环境下的事件验证
if (__DEV__) {
    const {
      emitsOptions,
      propsOptions: [propsOptions],
    } = instance
    if (emitsOptions) {
      if (
        !(event in emitsOptions) &&
        !(
          __COMPAT__ &&
          (event.startsWith('hook:') ||
            event.startsWith(compatModelEventPrefix))
        )
      ) {
        if (!propsOptions || !(toHandlerKey(camelize(event)) in propsOptions)) {
          warn(
            `Component emitted event "${event}" but it is neither declared in ` +
              `the emits option nor as an "${toHandlerKey(camelize(event))}" prop.`,
          )
        }
      } else {
        const validator = emitsOptions[event]
        if (isFunction(validator)) {
          const isValid = validator(...rawArgs)
          if (!isValid) {
            warn(
              `Invalid event arguments: event validation failed for event "${event}".`,
            )
          }
        }
      }
    }
  }

  let args = rawArgs
  const isCompatModelListener =
    __COMPAT__ && compatModelEventPrefix + event in props
  // 检查是否为模型更新事件
const isModelListener = isCompatModelListener || event.startsWith('update:')
  const modifiers = isCompatModelListener
    ? props.modelModifiers
    : isModelListener && getModelModifiers(props, event.slice(7))

  // for v-model update:xxx events, apply modifiers on args
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map(a => (isString(a) ? a.trim() : a))
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber)
    }
  }

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    devtoolsComponentEmit(instance, event, args)
  }

  if (__DEV__) {
    const lowerCaseEvent = event.toLowerCase()
    if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
      warn(
        `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(
            instance,
            instance.type,
          )} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(
            event,
          )}" instead of "${event}".`,
      )
    }
  }

  let handlerName
  let handler =
    props[(handlerName = toHandlerKey(event))] ||
    // also try camelCase event handler (#2249)
    props[(handlerName = toHandlerKey(camelize(event)))]
  // for v-model update:xxx events, also trigger kebab-case equivalent
  // for props passed via kebab-case
  if (!handler && isModelListener) {
    handler = props[(handlerName = toHandlerKey(hyphenate(event)))]
  }

  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }

  const onceHandler = props[handlerName + `Once`]
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {}
    } else if (instance.emitted[handlerName]) {
      return
    }
    instance.emitted[handlerName] = true
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }

  if (__COMPAT__) {
    compatModelEmit(instance, event, args)
    return compatInstanceEmit(instance, event, args)
  }
}

/**
 * 规范化组件的事件选项
 * 处理混入、继承等情况，合并所有事件选项
 * @param comp 组件定义
 * @param appContext 应用上下文
 * @param asMixin 是否作为混入处理
 * @returns 规范化后的事件选项对象或 null
 */
export function normalizeEmitsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false,
): ObjectEmitsOptions | null {
  const cache = appContext.emitsCache
  const cached = cache.get(comp)
  if (cached !== undefined) {
    return cached
  }

  const raw = comp.emits
  let normalized: ObjectEmitsOptions = {}

  // apply mixin/extends props
  let hasExtends = false
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    const extendEmits = (raw: ComponentOptions) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw, appContext, true)
      if (normalizedFromExtend) {
        hasExtends = true
        extend(normalized, normalizedFromExtend)
      }
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits)
    }
    if (comp.extends) {
      extendEmits(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits)
    }
  }

  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null)
    }
    return null
  }

  if (isArray(raw)) {
    raw.forEach(key => (normalized[key] = null))
  } else {
    extend(normalized, raw)
  }

  if (isObject(comp)) {
    cache.set(comp, normalized)
  }
  return normalized
}

// Check if an incoming prop key is a declared emit event listener.
// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
// both considered matched listeners.
/**
 * 检查传入的 prop 键是否为声明的事件监听器
 * @param options 事件选项
 * @param key 要检查的 prop 键
 * @returns 是否为事件监听器
 */
export function isEmitListener(
  options: ObjectEmitsOptions | null,
  key: string,
): boolean {
  // 如果没有事件选项或键不是以 on 开头，则不是事件监听器
if (!options || !isOn(key)) {
    return false
  }

  if (__COMPAT__ && key.startsWith(compatModelEventPrefix)) {
    return true
  }

  key = key.slice(2).replace(/Once$/, '')
  return (
    hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
    hasOwn(options, hyphenate(key)) ||
    hasOwn(options, key)
  )
}
