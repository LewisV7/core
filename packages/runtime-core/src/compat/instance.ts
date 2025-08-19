import {
  NOOP,
  extend,
  looseEqual,
  looseIndexOf,
  looseToNumber,
  toDisplayString,
} from '@vue/shared'
import type {
  ComponentPublicInstance,
  PublicPropertiesMap,
} from '../componentPublicInstance'
import { getCompatChildren } from './instanceChildren'
import {
  DeprecationTypes,
  assertCompatEnabled,
  isCompatEnabled,
  warnDeprecation,
} from './compatConfig'
import { off, on, once } from './instanceEventEmitter'
import { getCompatListeners } from './instanceListeners'
import { shallowReadonly } from '@vue/reactivity'
import { legacySlotProxyHandlers } from './componentFunctional'
import { compatH } from './renderFn'
import { createCommentVNode, createTextVNode } from '../vnode'
import { renderList } from '../helpers/renderList'
import {
  legacyBindDynamicKeys,
  legacyBindObjectListeners,
  legacyBindObjectProps,
  legacyCheckKeyCodes,
  legacyMarkOnce,
  legacyPrependModifier,
  legacyRenderSlot,
  legacyRenderStatic,
  legacyresolveScopedSlots,
} from './renderHelpers'
import { resolveFilter } from '../helpers/resolveAssets'
import type { Slots } from '../componentSlots'
import { resolveMergedOptions } from '../componentOptions'

export type LegacyPublicInstance = ComponentPublicInstance &
  LegacyPublicProperties

export interface LegacyPublicProperties {
  $set<T extends Record<keyof any, any>, K extends keyof T>(
    target: T,
    key: K,
    value: T[K],
  ): void
  $delete<T extends Record<keyof any, any>, K extends keyof T>(
    target: T,
    key: K,
  ): void
  $mount(el?: string | Element): this
  $destroy(): void
  $scopedSlots: Slots
  $on(event: string | string[], fn: Function): this
  $once(event: string, fn: Function): this
  $off(event?: string | string[], fn?: Function): this
  $children: LegacyPublicProperties[]
  $listeners: Record<string, Function | Function[]>
}

export function installCompatInstanceProperties(
  map: PublicPropertiesMap,
): void {
  const set = (target: any, key: any, val: any) => {
    target[key] = val
    return target[key]
  }

  const del = (target: any, key: any) => {
    delete target[key]
  }

  extend(map, {
    /**
     * Vue 2 中的 $set 方法
     * @param target - 目标对象
     * @param key - 属性键
     * @param value - 属性值
     */
    $set: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_SET, i)
      return set
    },

    /**
     * Vue 2 中的 $delete 方法
     * @param target - 目标对象
     * @param key - 属性键
     */
    $delete: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_DELETE, i)
      return del
    },

    /**
     * Vue 2 中的 $mount 方法
     * @param el - 挂载元素
     * @returns 实例本身
     */
    $mount: i => {
      assertCompatEnabled(
        DeprecationTypes.GLOBAL_MOUNT,
        null /* this warning is global */,
      )
      // root mount override from ./global.ts in installCompatMount
      return i.ctx._compat_mount || NOOP
    },

    /**
     * Vue 2 中的 $destroy 方法
     * 销毁实例
     */
    $destroy: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_DESTROY, i)
      // root destroy override from ./global.ts in installCompatMount
      return i.ctx._compat_destroy || NOOP
    },

    // overrides existing accessor
    $slots: i => {
      if (
        isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, i) &&
        i.render &&
        i.render._compatWrapped
      ) {
        return new Proxy(i.slots, legacySlotProxyHandlers)
      }
      return __DEV__ ? shallowReadonly(i.slots) : i.slots
    },

    $scopedSlots: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_SCOPED_SLOTS, i)
      return __DEV__ ? shallowReadonly(i.slots) : i.slots
    },

    /**
     * Vue 2 中的 $on 方法
     * @param event - 事件名称
     * @param callback - 事件回调
     * @returns 实例本身
     */
    $on: i => on.bind(null, i),
    /**
     * Vue 2 中的 $once 方法
     * @param event - 事件名称
     * @param callback - 事件回调
     * @returns 实例本身
     */
    $once: i => once.bind(null, i),
    /**
     * Vue 2 中的 $off 方法
     * @param event - 事件名称（可选）
     * @param callback - 事件回调（可选）
     * @returns 实例本身
     */
    $off: i => off.bind(null, i),

    $children: getCompatChildren,
    $listeners: getCompatListeners,

    // inject additional properties into $options for compat
    // e.g. vuex needs this.$options.parent
    /**
     * Vue 2 兼容的 $options 属性
     * 为兼容性注入额外属性（如 $options.parent）
     * @param i - 组件实例
     * @returns 选项对象
     */
    $options: i => {
      if (!isCompatEnabled(DeprecationTypes.PRIVATE_APIS, i)) {
        return resolveMergedOptions(i)
      }
      if (i.resolvedOptions) {
        return i.resolvedOptions
      }
      const res = (i.resolvedOptions = extend({}, resolveMergedOptions(i)))
      Object.defineProperties(res, {
        parent: {
          get() {
            warnDeprecation(DeprecationTypes.PRIVATE_APIS, i, '$options.parent')
            return i.proxy!.$parent
          },
        },
        propsData: {
          get() {
            warnDeprecation(
              DeprecationTypes.PRIVATE_APIS,
              i,
              '$options.propsData',
            )
            return i.vnode.props
          },
        },
      })
      return res
    },
  } as PublicPropertiesMap)

  const privateAPIs = {
    // needed by many libs / render fns
    $vnode: i => i.vnode,

    // some private properties that are likely accessed...
    _self: i => i.proxy,
    _uid: i => i.uid,
    _data: i => i.data,
    _isMounted: i => i.isMounted,
    _isDestroyed: i => i.isUnmounted,

    // v2 render helpers
    $createElement: () => compatH,
    _c: () => compatH,
    _o: () => legacyMarkOnce,
    _n: () => looseToNumber,
    _s: () => toDisplayString,
    _l: () => renderList,
    _t: i => legacyRenderSlot.bind(null, i),
    _q: () => looseEqual,
    _i: () => looseIndexOf,
    _m: i => legacyRenderStatic.bind(null, i),
    _f: () => resolveFilter,
    _k: i => legacyCheckKeyCodes.bind(null, i),
    _b: () => legacyBindObjectProps,
    _v: () => createTextVNode,
    _e: () => createCommentVNode,
    _u: () => legacyresolveScopedSlots,
    _g: () => legacyBindObjectListeners,
    _d: () => legacyBindDynamicKeys,
    _p: () => legacyPrependModifier,
  } as PublicPropertiesMap

  for (const key in privateAPIs) {
    map[key] = i => {
      if (isCompatEnabled(DeprecationTypes.PRIVATE_APIS, i)) {
        return privateAPIs[key](i)
      }
    }
  }
}
