/**
 * Vue 3 核心模块 - 列表渲染工具
 * 处理 v-for 指令的核心实现，支持多种数据源类型
 * 包括数组、字符串、数字、可迭代对象和普通对象
 */
import type { VNode, VNodeChild } from '../vnode'
import {
  isReactive,
  isReadonly,
  isShallow,
  shallowReadArray,
  toReactive,
  toReadonly,
} from '@vue/reactivity'
import { isArray, isObject, isString } from '@vue/shared'
import { warn } from '../warning'

/**
 * 处理字符串类型的 v-for 渲染
 * @param source 字符串数据源
 * @param renderItem 渲染函数，接收字符和索引作为参数
 * @returns 渲染后的 VNode 子节点数组
 * @private
 */
export function renderList(
  source: string,
  renderItem: (value: string, index: number) => VNodeChild,
): VNodeChild[]

/**
 * 处理数字类型的 v-for 渲染（范围循环）
 * @param source 数字，表示循环次数
 * @param renderItem 渲染函数，接收当前值和索引作为参数
 * @returns 渲染后的 VNode 子节点数组
 */
export function renderList(
  source: number,
  renderItem: (value: number, index: number) => VNodeChild,
): VNodeChild[]

/**
 * 处理数组类型的 v-for 渲染
 * @param source 数组数据源
 * @param renderItem 渲染函数，接收数组项和索引作为参数
 * @returns 渲染后的 VNode 子节点数组
 */
export function renderList<T>(
  source: T[],
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * 处理可迭代对象的 v-for 渲染
 * @param source 可迭代对象数据源
 * @param renderItem 渲染函数，接收迭代项和索引作为参数
 * @returns 渲染后的 VNode 子节点数组
 */
export function renderList<T>(
  source: Iterable<T>,
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * 处理对象类型的 v-for 渲染
 * @param source 对象数据源
 * @param renderItem 渲染函数，接收属性值、属性名和索引作为参数
 * @returns 渲染后的 VNode 子节点数组
 */
export function renderList<T>(
  source: T,
  renderItem: <K extends keyof T>(
    value: T[K],
    key: string,
    index: number,
  ) => VNodeChild,
): VNodeChild[]

/**
 * renderList 函数的实际实现
 * 根据不同类型的数据源生成对应的 VNode 数组
 * 
 * @param source 数据源，可以是数组、字符串、数字、可迭代对象或普通对象
 * @param renderItem 渲染函数，根据数据源类型接收不同参数
 * @param cache 可选的缓存数组，用于优化渲染性能
 * @param index 可选的缓存索引
 * @returns 渲染后的 VNode 子节点数组
 */
export function renderList(
  source: any,
  renderItem: (...args: any[]) => VNodeChild,
  cache?: any[],
  index?: number,
): VNodeChild[] {
  let ret: VNodeChild[]
  // 获取缓存的 VNode（如果存在）
  const cached = (cache && cache[index!]) as VNode[] | undefined
  // 检查数据源是否为数组
  const sourceIsArray = isArray(source)

  // 处理数组或字符串类型的数据源
  if (sourceIsArray || isString(source)) {
    // 检查是否为响应式数组
    const sourceIsReactiveArray = sourceIsArray && isReactive(source)
    let needsWrap = false
    let isReadonlySource = false
    // 对于非浅层响应式数组，需要特殊处理
    if (sourceIsReactiveArray) {
      needsWrap = !isShallow(source)
      isReadonlySource = isReadonly(source)
      // 浅读数组，避免不必要的响应式转换
      source = shallowReadArray(source)
    }
    // 创建结果数组
    ret = new Array(source.length)
    // 遍历数据源，生成 VNode
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        // 对于需要包装的响应式数组项，根据是否只读进行不同处理
        needsWrap
          ? isReadonlySource
            ? toReadonly(toReactive(source[i]))
            : toReactive(source[i])
          : source[i],
        i,
        undefined,
        // 传递缓存的 VNode 以优化性能
        cached && cached[i],
      )
    }
  // 处理数字类型的数据源（范围循环）
  } else if (typeof source === 'number') {
    // 开发环境下，检查是否为整数
    if (__DEV__ && !Number.isInteger(source)) {
      warn(`The v-for range expect an integer value but got ${source}.`)
    }
    // 创建结果数组
    ret = new Array(source)
    // 遍历数字范围，生成 VNode
    for (let i = 0; i < source; i++) {
      // 注意：范围循环从 1 开始
      ret[i] = renderItem(i + 1, i, undefined, cached && cached[i])
    }
  // 处理对象类型的数据源
  } else if (isObject(source)) {
    // 检查是否为可迭代对象
    if (source[Symbol.iterator as any]) {
      // 处理可迭代对象
      ret = Array.from(source as Iterable<any>, (item, i) =>
        renderItem(item, i, undefined, cached && cached[i]),
      )
    } else {
      // 处理普通对象
      const keys = Object.keys(source)
      ret = new Array(keys.length)
      // 遍历对象属性，生成 VNode
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        ret[i] = renderItem(source[key], key, i, cached && cached[i])
      }
    }
  // 处理无效数据源
  } else {
    ret = []
  }

  // 更新缓存
  if (cache) {
    cache[index!] = ret
  }
  return ret
}
