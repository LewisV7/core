/*
 * 虚拟节点创建工具 (h函数) 实现
 * h函数是createVNode的用户友好版本，支持多种调用方式，允许在可能的情况下省略props参数
 * 本文件定义了h函数的各种重载类型和实际实现
 */
import {
  type Comment,
  type Fragment,
  type Text,
  type VNode,
  type VNodeArrayChildren,
  type VNodeProps,
  createVNode,
  isVNode,
} from './vnode'
import type { Teleport, TeleportProps } from './components/Teleport'
import type { Suspense, SuspenseProps } from './components/Suspense'
import { type IfAny, isArray, isObject } from '@vue/shared'
import type { RawSlots } from './componentSlots'
import type {
  Component,
  ComponentOptions,
  ConcreteComponent,
  FunctionalComponent,
} from './component'
import type { EmitsOptions } from './componentEmits'
import type { DefineComponent } from './apiDefineComponent'

// `h` 是 `createVNode` 的更用户友好版本，允许在可能的情况下省略props参数
// 它适用于手动编写的渲染函数
// 编译器生成的代码使用 `createVNode`，因为：
// 1. 它是单态的，避免了额外的调用开销
// 2. 它允许指定patchFlags进行优化

/*
// type only
h('div')

// type + props
h('div', {})

// type + omit props + children
// Omit props does NOT support named slots
h('div', []) // array
h('div', 'foo') // text
h('div', h('br')) // vnode
h(Component, () => {}) // default slot

// type + props + children
h('div', {}, []) // array
h('div', {}, 'foo') // text
h('div', {}, h('br')) // vnode
h(Component, {}, () => {}) // default slot
h(Component, {}, {}) // named slots

// named slots without props requires explicit `null` to avoid ambiguity
h(Component, null, {})
**/

/**
 * 原始属性类型
 * 扩展VNodeProps并添加特殊标记以区分vnode对象和数组子节点
 */
type RawProps = VNodeProps & {
  // used to differ from a single VNode object as children
  __v_isVNode?: never
  // used to differ from Array children
  [Symbol.iterator]?: never
} & Record<string, any>

/**
 * 原始子节点类型
 * 支持字符串、数字、布尔值、VNode、VNode数组或函数
 */
type RawChildren =
  | string
  | number
  | boolean
  | VNode
  | VNodeArrayChildren
  | (() => any)

/**
 * 从defineComponent返回的假构造函数类型
 * 用于类型推断和组件实例化
 */
interface Constructor<P = any> {
  __isFragment?: never
  __isTeleport?: never
  __isSuspense?: never
  new (...args: any[]): { $props: P }
}

/**
 * HTML元素事件处理函数类型
 * 定义了各种DOM事件的处理器类型
 */
type HTMLElementEventHandler = {
  [K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (
    ev: HTMLElementEventMap[K],
  ) => any
}

// The following is a series of overloads for providing props validation of
// manually written render functions.

// HTML元素类型的h函数重载
export function h<K extends keyof HTMLElementTagNameMap>(
  type: K,
  children?: RawChildren,
): VNode
export function h<K extends keyof HTMLElementTagNameMap>(
  type: K,
  props?: (RawProps & HTMLElementEventHandler) | null,
  children?: RawChildren | RawSlots,
): VNode

// 自定义元素类型的h函数重载
export function h(type: string, children?: RawChildren): VNode
export function h(
  type: string,
  props?: RawProps | null,
  children?: RawChildren | RawSlots,
): VNode

// 文本/注释类型的h函数重载
export function h(
  type: typeof Text | typeof Comment,
  children?: string | number | boolean,
): VNode
export function h(
  type: typeof Text | typeof Comment,
  props?: null,
  children?: string | number | boolean,
): VNode
// 片段类型的h函数重载
export function h(type: typeof Fragment, children?: VNodeArrayChildren): VNode
export function h(
  type: typeof Fragment,
  props?: RawProps | null,
  children?: VNodeArrayChildren,
): VNode

// Teleport组件的h函数重载 (target属性是必需的)
export function h(
  type: typeof Teleport,
  props: RawProps & TeleportProps,
  children: RawChildren | RawSlots,
): VNode

// Suspense组件的h函数重载
export function h(type: typeof Suspense, children?: RawChildren): VNode
export function h(
  type: typeof Suspense,
  props?: (RawProps & SuspenseProps) | null,
  children?: RawChildren | RawSlots,
): VNode

// 函数式组件的h函数重载
export function h<
  P,
  E extends EmitsOptions = {},
  S extends Record<string, any> = any,
>(
  type: FunctionalComponent<P, any, S, any>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | IfAny<S, RawSlots, S>,
): VNode

// 通用组件类型的h函数重载
export function h(type: Component, children?: RawChildren): VNode

// 具体组件的h函数重载
export function h<P>(
  type: ConcreteComponent | string,
  children?: RawChildren,
): VNode
export function h<P>(
  type: ConcreteComponent<P> | string,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren,
): VNode

// 无props组件的h函数重载
export function h<P>(
  type: Component<P>,
  props?: (RawProps & P) | null,
  children?: RawChildren | RawSlots,
): VNode

// 排除`defineComponent`构造函数的h函数重载
export function h<P>(
  type: ComponentOptions<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// `defineComponent`或类组件返回的假构造函数类型的h函数重载
export function h(type: Constructor, children?: RawChildren): VNode
export function h<P>(
  type: Constructor<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// `defineComponent`返回的假构造函数类型的h函数重载
export function h(type: DefineComponent, children?: RawChildren): VNode
export function h<P>(
  type: DefineComponent<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// 捕获所有类型的h函数重载
export function h(type: string | Component, children?: RawChildren): VNode
export function h<P>(
  type: string | Component<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

/**
 * h函数的实际实现
 * @param type 节点类型 (标签名、组件等)
 * @param propsOrChildren 属性对象或子节点
 * @param children 子节点
 * @returns 创建的虚拟节点
 */
// 实际实现
export function h(type: any, propsOrChildren?: any, children?: any): VNode {
  const l = arguments.length
  if (l === 2) {
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // 单个vnode没有属性的情况
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren])
      }
      // 有属性但没有子节点的情况
      return createVNode(type, propsOrChildren)
    } else {
      // 省略属性的情况
      // omit props
      return createVNode(type, null, propsOrChildren)
    }
  } else {
    // 处理超过3个参数的情况
    if (l > 3) {
      children = Array.prototype.slice.call(arguments, 2)
      // 处理3个参数且第三个参数是vnode的情况
    } else if (l === 3 && isVNode(children)) {
      children = [children]
    }
    return createVNode(type, propsOrChildren, children)
  }
}
