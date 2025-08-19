/**
 * Vue 3 核心模块 - 组件插槽系统
 * 处理组件插槽的初始化、标准化和访问逻辑
 */
import { type ComponentInternalInstance, currentInstance } from './component'
import {
  type VNode,
  type VNodeChild,
  type VNodeNormalizedChildren,
  normalizeVNode,
} from './vnode'
import {
  EMPTY_OBJ,
  type IfAny,
  type Prettify,
  ShapeFlags,
  SlotFlags,
  def,
  isArray,
  isFunction,
} from '@vue/shared'
import { warn } from './warning'
import { isKeepAlive } from './components/KeepAlive'
import {
  type ContextualRenderFn,
  currentRenderingInstance,
  withCtx,
} from './componentRenderContext'
import { isHmrUpdating } from './hmr'
import { DeprecationTypes, isCompatEnabled } from './compat/compatConfig'
import { TriggerOpTypes, trigger } from '@vue/reactivity'
import { createInternalObject } from './internalObject'

/**
 * 插槽函数类型
 * @template T 插槽参数类型
 * @param {...any} args 传递给插槽的参数
 * @returns {VNode[]} 插槽渲染的虚拟节点数组
 */
export type Slot<T extends any = any> = (
  ...args: IfAny<T, any[], [T] | (T extends undefined ? [] : never)>
) => VNode[]

/**
 * 内部插槽对象类型
 * 存储组件的所有插槽函数
 */
export type InternalSlots = {
  [name: string]: Slot | undefined
}

/**
 * 只读插槽对象类型
 * 提供给用户的插槽接口
 */
export type Slots = Readonly<InternalSlots>

/**
 * 插槽类型标记符号
 * 用于类型系统中标记插槽类型
 */
declare const SlotSymbol: unique symbol
/**
 * 插槽类型定义
 * @template T 插槽名称和类型的映射
 */
export type SlotsType<T extends Record<string, any> = Record<string, any>> = {
  [SlotSymbol]?: T
}

/**
 * 严格解包插槽类型
 * @template S 插槽类型
 * @template T 解包后的类型
 */
export type StrictUnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never] ? Slots : Readonly<T> & T

/**
 * 解包插槽类型
 * @template S 插槽类型
 * @template T 解包后的类型
 */
export type UnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never]
  ? Slots
  : Readonly<
      Prettify<{
        [K in keyof T]: NonNullable<T[K]> extends (...args: any[]) => any
          ? T[K]
          : Slot<T[K]>
      }>
    >

/**
 * 原始插槽对象类型
 * 未经标准化的插槽输入
 */
export type RawSlots = {
  [name: string]: unknown
  // manual render fn hint to skip forced children updates
  $stable?: boolean
  /**
   * for tracking slot owner instance. This is attached during
   * normalizeChildren when the component vnode is created.
   * @internal
   */
  _ctx?: ComponentInternalInstance | null
  /**
   * indicates compiler generated slots
   * we use a reserved property instead of a vnode patchFlag because the slots
   * object may be directly passed down to a child component in a manual
   * render function, and the optimization hint need to be on the slot object
   * itself to be preserved.
   * @internal
   */
  _?: SlotFlags
  /**
   * cache indexes for slot content
   * @internal
   */
  __?: number[]
}

/**
 * 判断是否为内部保留的插槽键
 * @param {string} key 要检查的键
 * @returns {boolean} 是否为内部键
 */
const isInternalKey = (key: string) =>
  key === '_' || key === '__' || key === '_ctx' || key === '$stable'

/**
 * 标准化插槽值
 * 将插槽值转换为虚拟节点数组
 * @param {unknown} value 要标准化的值
 * @returns {VNode[]} 标准化后的虚拟节点数组
 */
const normalizeSlotValue = (value: unknown): VNode[] =>
  isArray(value)
    ? value.map(normalizeVNode)
    : [normalizeVNode(value as VNodeChild)]

/**
 * 标准化单个插槽
 * 将原始插槽函数转换为标准化的插槽函数
 * @param {string} key 插槽名称
 * @param {Function} rawSlot 原始插槽函数
 * @param {ComponentInternalInstance | null | undefined} ctx 组件实例上下文
 * @returns {Slot} 标准化后的插槽函数
 */
const normalizeSlot = (
  key: string,
  rawSlot: Function,
  ctx: ComponentInternalInstance | null | undefined,
): Slot => {
  // 已经标准化过的插槽 (#5353)
  if ((rawSlot as any)._n) {
    // already normalized - #5353
    return rawSlot as Slot
  }
  // 使用组件渲染上下文包装插槽函数
  const normalized = withCtx((...args: any[]) => {
    // 开发环境下，检查插槽调用是否在渲染函数内
    if (
      __DEV__ &&
      currentInstance &&
      !(ctx === null && currentRenderingInstance) &&
      !(ctx && ctx.root !== currentInstance.root)
    ) {
      warn(
        `Slot "${key}" invoked outside of the render function: ` +
          `this will not track dependencies used in the slot. ` +
          `Invoke the slot function inside the render function instead.`,
      )
    }
    return normalizeSlotValue(rawSlot(...args))
  }, ctx) as Slot
  // 标记为非编译的插槽
  ;(normalized as ContextualRenderFn)._c = false
  return normalized
}

/**
 * 标准化对象形式的插槽
 * @param {RawSlots} rawSlots 原始插槽对象
 * @param {InternalSlots} slots 内部插槽对象
 * @param {ComponentInternalInstance} instance 组件实例
 */
const normalizeObjectSlots = (
  rawSlots: RawSlots,
  slots: InternalSlots,
  instance: ComponentInternalInstance,
) => {
  // 获取插槽的上下文实例
  const ctx = rawSlots._ctx
  // 遍历所有插槽
  for (const key in rawSlots) {
    // 跳过内部键
    if (isInternalKey(key)) continue
    const value = rawSlots[key]
    // 函数类型的插槽
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx)
    // 非函数类型的插槽
    } else if (value != null) {
      if (
        __DEV__ &&
        !(
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance)
        )
      ) {
        warn(
          `Non-function value encountered for slot "${key}". ` +
            `Prefer function slots for better performance.`,
        )
      }
      const normalized = normalizeSlotValue(value)
      slots[key] = () => normalized
    }
  }
}

/**
 * 标准化虚拟节点形式的插槽
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {VNodeNormalizedChildren} children 子节点
 */
const normalizeVNodeSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
) => {
  if (
    __DEV__ &&
    !isKeepAlive(instance.vnode) &&
    !(__COMPAT__ && isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance))
  ) {
    warn(
      `Non-function value encountered for default slot. ` +
        `Prefer function slots for better performance.`,
    )
  }
  const normalized = normalizeSlotValue(children)
  instance.slots.default = () => normalized
}

/**
 * 赋值插槽
 * 将子组件的插槽赋值给当前组件
 * @param {InternalSlots} slots 目标插槽对象
 * @param {Slots} children 源插槽对象
 * @param {boolean} optimized 是否为优化模式
 */
const assignSlots = (
  slots: InternalSlots,
  children: Slots,
  optimized: boolean,
) => {
  // 遍历所有源插槽
  for (const key in children) {
    // #2893
    // when rendering the optimized slots by manually written render function,
    // do not copy the `slots._` compiler flag so that `renderSlot` creates
    // slot Fragment with BAIL patchFlag to force full updates
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key]
    }
  }
}

/**
 * 初始化组件插槽
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {VNodeNormalizedChildren} children 子节点
 * @param {boolean} optimized 是否为优化模式
 */
export const initSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  // 创建内部插槽对象
  const slots = (instance.slots = createInternalObject())
  // 处理对象形式的插槽
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    // 获取缓存索引
    const cacheIndexes = (children as RawSlots).__
    // 使缓存索引标记不可枚举
    if (cacheIndexes) def(slots, '__', cacheIndexes, true)

    const type = (children as RawSlots)._
    if (type) {
      assignSlots(slots, children as Slots, optimized)
      // make compiler marker non-enumerable
      if (optimized) {
        def(slots, '_', type, true)
      }
    } else {
      normalizeObjectSlots(children as RawSlots, slots, instance)
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children)
  }
}

export const updateSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  const { vnode, slots } = instance
  let needDeletionCheck = true
  let deletionComparisonTarget = EMPTY_OBJ
  if (vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      // compiled slots.
      if (__DEV__ && isHmrUpdating) {
        // Parent was HMR updated so slot content may have changed.
        // force update slots and mark instance for hmr as well
        assignSlots(slots, children as Slots, optimized)
        trigger(instance, TriggerOpTypes.SET, '$slots')
      } else if (optimized && type === SlotFlags.STABLE) {
        // compiled AND stable.
        // no need to update, and skip stale slots removal.
        needDeletionCheck = false
      } else {
        // compiled but dynamic (v-if/v-for on slots) - update slots, but skip
        // normalization.
        assignSlots(slots, children as Slots, optimized)
      }
    } else {
      needDeletionCheck = !(children as RawSlots).$stable
      normalizeObjectSlots(children as RawSlots, slots, instance)
    }
    deletionComparisonTarget = children as RawSlots
  } else if (children) {
    // non slot object children (direct value) passed to a component
    normalizeVNodeSlots(instance, children)
    deletionComparisonTarget = { default: 1 }
  }

  // delete stale slots
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key]
      }
    }
  }
}
