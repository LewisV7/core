import { TrackOpTypes } from './constants'
import { endBatch, pauseTracking, resetTracking, startBatch } from './effect'
import { isProxy, isShallow, toRaw, toReactive } from './reactive'
import { ARRAY_ITERATE_KEY, track } from './dep'
import { isArray } from '@vue/shared'

/**
 * 跟踪数组迭代并返回：
 * - 如果输入是响应式的：带有响应式值的克隆原始数组
 * - 如果输入是非响应式或浅层响应式的：原始数组
 */
/**
 * 将数组转换为响应式数组并跟踪其迭代
 * @template T 数组元素类型
 * @param array 输入数组
 * @returns 处理后的数组
 */
export function reactiveReadArray<T>(array: T[]): T[] {
  // 获取原始对象
  const raw = toRaw(array)
  // 如果已经是原始对象则直接返回
  if (raw === array) return raw
  // 跟踪数组的迭代操作
  track(raw, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)
  // 如果是浅层响应式，则返回原始数组；否则对每个元素进行响应式转换
  return isShallow(array) ? raw : raw.map(toReactive)
}

/**
 * 跟踪数组迭代但返回原始数组
 */
// 如果为浅层则直接调用track函数 并返回该数组
/**
 * 浅层读取数组并跟踪其迭代
 * @template T 数组元素类型
 * @param arr 输入数组
 * @returns 原始数组
 */
export function shallowReadArray<T>(arr: T[]): T[] {
  // 转换为原始数组并跟踪迭代
  track((arr = toRaw(arr)), TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)
  return arr
}

// 数组方法工具对象 - 重写了原生数组方法以支持响应式
export const arrayInstrumentations: Record<string | symbol, Function> = <any>{
  __proto__: null,

  /**
   * 数组迭代器方法 - 用于 for...of 循环
   * @returns 迭代器
   */
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, toReactive)
  },

  /**
   * 连接两个或多个数组
   * @param args 要连接的数组或值
   * @returns 新的连接后的数组
   */
  concat(...args: unknown[]) {
    return reactiveReadArray(this).concat(
      ...args.map(x => (isArray(x) ? reactiveReadArray(x) : x)),
    )
  },

  /**
   * 返回数组的键值对迭代器
   * @returns 键值对迭代器
   */
  entries() {
    return iterator(this, 'entries', (value: [number, unknown]) => {
      value[1] = toReactive(value[1])
      return value
    })
  },

  /**
   * 测试数组的所有元素是否都通过了指定函数的测试
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 如果所有元素都通过测试则返回 true，否则返回 false
   */
  every(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'every', fn, thisArg, undefined, arguments)
  },

  /**
   * 创建一个新数组，包含通过指定函数测试的所有元素
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 包含通过测试的元素的新数组
   */
  filter(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'filter', fn, thisArg, v => v.map(toReactive), arguments)
  },

  /**
   * 返回数组中满足指定条件的第一个元素
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 满足条件的第一个元素，如果没有找到则返回 undefined
   */
  find(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'find', fn, thisArg, toReactive, arguments)
  },

  /**
   * 返回数组中满足指定条件的第一个元素的索引
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 满足条件的第一个元素的索引，如果没有找到则返回 -1
   */
  findIndex(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findIndex', fn, thisArg, undefined, arguments)
  },

  /**
   * 从数组的末尾开始查找，返回满足指定条件的第一个元素
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 满足条件的第一个元素，如果没有找到则返回 undefined
   */
  findLast(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findLast', fn, thisArg, toReactive, arguments)
  },

  /**
   * 从数组的末尾开始查找，返回满足指定条件的第一个元素的索引
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 满足条件的第一个元素的索引，如果没有找到则返回 -1
   */
  findLastIndex(
    fn: (item: unknown, index: number, array: unknown[]) => boolean,
    thisArg?: unknown,
  ) {
    return apply(this, 'findLastIndex', fn, thisArg, undefined, arguments)
  },

  // flat, flatMap 可以从 ARRAY_ITERATE 中受益，但实现不那么直接

  /**
   * 对数组中的每个元素执行指定的函数
   * @param fn 要执行的函数
   * @param thisArg 函数的 this 值
   */
  forEach(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'forEach', fn, thisArg, undefined, arguments)
  },

  /**
   * 检查数组是否包含指定的元素
   * @param args 要查找的元素和可选的起始索引
   * @returns 如果包含则返回 true，否则返回 false
   */
  includes(...args: unknown[]) {
    return searchProxy(this, 'includes', args)
  },

  /**
   * 返回数组中第一次出现指定元素的索引
   * @param args 要查找的元素和可选的起始索引
   * @returns 元素第一次出现的索引，如果没有找到则返回 -1
   */
  indexOf(...args: unknown[]) {
    return searchProxy(this, 'indexOf', args)
  },

  /**
   * 将数组中的所有元素连接成一个字符串
   * @param separator 分隔符
   * @returns 连接后的字符串
   */
  join(separator?: string) {
    return reactiveReadArray(this).join(separator)
  },

  // keys() 迭代器只读取 `length`，不需要优化

  /**
   * 返回数组中最后一次出现指定元素的索引
   * @param args 要查找的元素和可选的起始索引
   * @returns 元素最后一次出现的索引，如果没有找到则返回 -1
   */
  lastIndexOf(...args: unknown[]) {
    return searchProxy(this, 'lastIndexOf', args)
  },

  /**
   * 创建一个新数组，其结果是该数组中的每个元素都调用一次提供的函数后的返回值
   * @param fn 映射函数
   * @param thisArg 映射函数的 this 值
   * @returns 新数组
   */
  map(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'map', fn, thisArg, undefined, arguments)
  },

  /**
   * 删除并返回数组的最后一个元素
   * @returns 被删除的元素，如果数组为空则返回 undefined
   */
  pop() {
    return noTracking(this, 'pop')
  },

  /**
   * 向数组的末尾添加一个或多个元素，并返回新的长度
   * @param args 要添加的元素
   * @returns 新数组的长度
   */
  push(...args: unknown[]) {
    return noTracking(this, 'push', args)
  },

  /**
   * 对数组中的所有元素执行一个由您提供的reducer函数(升序)，将其结果汇总为单个返回值
   * @param fn reducer函数
   * @param args 初始值
   * @returns 最终的累积结果
   */
  reduce(
    fn: (
      acc: unknown,
      item: unknown,
      index: number,
      array: unknown[],
    ) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduce', fn, args)
  },

  /**
   * 对数组中的所有元素执行一个由您提供的reducer函数(降序)，将其结果汇总为单个返回值
   * @param fn reducer函数
   * @param args 初始值
   * @returns 最终的累积结果
   */
  reduceRight(
    fn: (
      acc: unknown,
      item: unknown,
      index: number,
      array: unknown[],
    ) => unknown,
    ...args: unknown[]
  ) {
    return reduce(this, 'reduceRight', fn, args)
  },

  /**
   * 删除并返回数组的第一个元素
   * @returns 被删除的元素，如果数组为空则返回 undefined
   */
  shift() {
    return noTracking(this, 'shift')
  },

  // slice 可以使用 ARRAY_ITERATE，但似乎也需要范围跟踪

  /**
   * 测试数组中是否至少有一个元素通过了指定函数的测试
   * @param fn 测试函数
   * @param thisArg 测试函数的 this 值
   * @returns 如果至少有一个元素通过测试则返回 true，否则返回 false
   */
  some(
    fn: (item: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ) {
    return apply(this, 'some', fn, thisArg, undefined, arguments)
  },

  /**
   * 通过删除或替换现有元素或者添加新元素来修改数组，并以数组形式返回被修改的内容
   * @param args 起始索引、要删除的元素数量和要添加的新元素
   * @returns 包含被删除元素的数组
   */
  splice(...args: unknown[]) {
    return noTracking(this, 'splice', args)
  },

  /**
   * 返回一个新数组，其元素顺序与原数组相反
   * @returns 反转后的新数组
   */
  toReversed() {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toReversed()
  },

  /**
   * 返回一个新数组，其中的元素按指定的比较函数排序
   * @param comparer 比较函数
   * @returns 排序后的新数组
   */
  toSorted(comparer?: (a: unknown, b: unknown) => number) {
    // @ts-expect-error user code may run in es2016+
    return reactiveReadArray(this).toSorted(comparer)
  },

  /**
   * 返回一个新数组，其中包含了原数组的修改版本（不改变原数组）
   * @param args 起始索引、要删除的元素数量和要添加的新元素
   * @returns 修改后的新数组
   */
  toSpliced(...args: unknown[]) {
    // @ts-expect-error user code may run in es2016+
    return (reactiveReadArray(this).toSpliced as any)(...args)
  },

  /**
   * 向数组的开头添加一个或多个元素，并返回新的长度
   * @param args 要添加的元素
   * @returns 新数组的长度
   */
  unshift(...args: unknown[]) {
    return noTracking(this, 'unshift', args)
  },

  /**
   * 返回数组的值迭代器
   * @returns 值迭代器
   */
  values() {
    return iterator(this, 'values', toReactive)
  },
}

// instrument iterators to take ARRAY_ITERATE dependency
// 重构迭代方法
function iterator(
  self: unknown[],
  method: keyof Array<unknown>,
  wrapValue: (value: any) => unknown,
) {
  // note that taking ARRAY_ITERATE dependency here is not strictly equivalent
  // to calling iterate on the proxified array.
  // creating the iterator does not access any array property:
  // it is only when .next() is called that length and indexes are accessed.
  // pushed to the extreme, an iterator could be created in one effect scope,
  // partially iterated in another, then iterated more in yet another.
  // given that JS iterator can only be read once, this doesn't seem like
  // a plausible use-case, so this tracking simplification seems ok.
  // 浅层数组响应式
  const arr = shallowReadArray(self)
  // 获取迭代过程中的下一个
  const iter = (arr[method] as any)() as IterableIterator<unknown> & {
    _next: IterableIterator<unknown>['next']
  }
  // 获得的arr并不是传过来的值 并且不是浅层对象则执行以下分支
  if (arr !== self && !isShallow(self)) {
    // 根据传过来的函数执行
    iter._next = iter.next
    iter.next = () => {
      const result = iter._next()
      if (result.value) {
        result.value = wrapValue(result.value)
      }
      return result
    }
  }
  return iter
}

// in the codebase we enforce es2016, but user code may run in environments
// higher than that
type ArrayMethods = keyof Array<any> | 'findLast' | 'findLastIndex'

const arrayProto = Array.prototype
// instrument functions that read (potentially) all items
// to take ARRAY_ITERATE dependency
// 重构apply
function apply(
  self: unknown[],
  method: ArrayMethods,
  fn: (item: unknown, index: number, array: unknown[]) => unknown,
  thisArg?: unknown,
  wrappedRetFn?: (result: any) => unknown,
  args?: IArguments,
) {
  // 获取响应式数组
  const arr = shallowReadArray(self)
  // 这个数组是否需要进行代理
  const needsWrap = arr !== self && !isShallow(self)
  // @ts-expect-error our code is limited to es2016 but user code is not
  const methodFn = arr[method]

  // #11759
  // If the method being called is from a user-extended Array, the arguments will be unknown
  // (unknown order and unknown parameter types). In this case, we skip the shallowReadArray
  // handling and directly call apply with self.
  // 如果是数组原始方法 则执行这个
  if (methodFn !== arrayProto[method as any]) {
    const result = methodFn.apply(self, args)
    // 如果需要代理则调用响应式方法将其变为响应式
    return needsWrap ? toReactive(result) : result
  }
  // 将传过来的其他方法
  let wrappedFn = fn
  if (arr !== self) {
    if (needsWrap) {
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, toReactive(item), index, self)
      }
    } else if (fn.length > 2) {
      wrappedFn = function (this: unknown, item, index) {
        return fn.call(this, item, index, self)
      }
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg)
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result
}

// instrument reduce and reduceRight to take ARRAY_ITERATE dependency
// reduce方法
function reduce(
  self: unknown[],
  method: keyof Array<any>,
  fn: (acc: unknown, item: unknown, index: number, array: unknown[]) => unknown,
  args: unknown[],
) {
  const arr = shallowReadArray(self)
  let wrappedFn = fn
  if (arr !== self) {
    if (!isShallow(self)) {
      wrappedFn = function (this: unknown, acc, item, index) {
        return fn.call(this, acc, toReactive(item), index, self)
      }
    } else if (fn.length > 3) {
      wrappedFn = function (this: unknown, acc, item, index) {
        return fn.call(this, acc, item, index, self)
      }
    }
  }
  return (arr[method] as any)(wrappedFn, ...args)
}

// instrument identity-sensitive methods to account for reactive proxies
// 寻找代理对象
function searchProxy(
  self: unknown[],
  method: keyof Array<any>,
  args: unknown[],
) {
  // 获取原始对象
  const arr = toRaw(self) as any
  // 调用track函数
  track(arr, TrackOpTypes.ITERATE, ARRAY_ITERATE_KEY)
  // we run the method using the original args first (which may be reactive)
  //
  const res = arr[method](...args)

  // if that didn't work, run it again using raw values.
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0])
    return arr[method](...args)
  }

  return res
}

// instrument length-altering mutation methods to avoid length being tracked
// which leads to infinite loops in some cases (#2137)
// 不在进行监视？
function noTracking(
  self: unknown[],
  method: keyof Array<any>,
  args: unknown[] = [],
) {
  pauseTracking()
  startBatch()
  const res = (toRaw(self) as any)[method].apply(self, args)
  endBatch()
  resetTracking()
  return res
}
