import { ErrorCodes, callWithErrorHandling, handleError } from './errorHandling'
import { NOOP, isArray } from '@vue/shared'
import { type ComponentInternalInstance, getComponentName } from './component'

/**
 * 调度任务标志枚举
 * 用于标记任务的状态和特性
 */
export enum SchedulerJobFlags {
  /** 任务已入队 */
  QUEUED = 1 << 0,
  /** 任务是预更新钩子 */
  PRE = 1 << 1,
  /**
   * 允许任务递归触发自身
   * 默认情况下，任务不能触发自身，因为某些内置方法调用也会执行读取操作
   * 可能导致无限循环。允许的情况包括组件更新函数和监视回调。
   */
  ALLOW_RECURSE = 1 << 2,
  /** 任务已被处置 */
  DISPOSED = 1 << 3,
}

/**
 * 调度任务接口
 * 扩展自Function，表示可执行的任务
 */
export interface SchedulerJob extends Function {
  /** 任务ID，用于确定执行顺序 */
  id?: number
  /**
   * 任务标志
   * 技术上可以是undefined，但在位运算中如同0一样使用
   */
  flags?: SchedulerJobFlags
  /**
   * 组件内部实例
   * 由renderer.ts在设置组件渲染效果时附加
   * 用于在报告最大递归更新时获取组件信息
   */
  i?: ComponentInternalInstance
}

export type SchedulerJobs = SchedulerJob | SchedulerJob[]

const queue: SchedulerJob[] = []
let flushIndex = -1

const pendingPostFlushCbs: SchedulerJob[] = []
let activePostFlushCbs: SchedulerJob[] | null = null
let // 重置索引
postFlushIndex = 0

const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
let currentFlushPromise: Promise<void> | null = null

const RECURSION_LIMIT = 100
type CountMap = Map<SchedulerJob, number>

/**
 * 在下一个DOM更新周期后执行回调
 * @param fn 要执行的回调函数
 * @returns 一个Promise，在DOM更新周期后resolve
 */
export function nextTick<T = void, R = void>(
  this: T,
  fn?: (this: T) => R,
): Promise<Awaited<R>> {
  // 获取当前刷新Promise或已解决的Promise
const p = currentFlushPromise || resolvedPromise
  // 如果提供了回调，在Promise解决后执行；否则直接返回Promise
return fn ? p.then(this ? fn.bind(this) : fn) : p
}

// Use binary-search to find a suitable position in the queue. The queue needs
// to be sorted in increasing order of the job ids. This ensures that:
// 1. Components are updated from parent to child. As the parent is always
//    created before the child it will always have a smaller id.
// 2. If a component is unmounted during a parent component's update, its update
//    can be skipped.
// A pre watcher will have the same id as its component's update job. The
// watcher should be inserted immediately before the update job. This allows
// watchers to be skipped if the component is unmounted by the parent update.
/**
 * 使用二分查找找到任务在队列中的插入位置
 * @param id 任务ID
 * @returns 插入位置的索引
 */
function findInsertionIndex(id: number) {
  let start = flushIndex + 1
  let end = queue.length

  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    if (
      middleJobId < id ||
      (middleJobId === id && middleJob.flags! & SchedulerJobFlags.PRE)
    ) {
      start = middle + 1
    } else {
      end = middle
    }
  }

  return start
}

/**
 * 将任务加入队列
 * @param job 要加入队列的任务
 */
export function queueJob(job: SchedulerJob): void {
  // 如果任务尚未入队
if (!(job.flags! & SchedulerJobFlags.QUEUED)) {
    // 获取任务ID
const jobId = getId(job)
    // 获取队尾任务
const lastJob = queue[queue.length - 1]
    // 快速路径：如果队列为空或任务ID大于队尾任务ID
if (
      !lastJob ||
      // fast path when the job id is larger than the tail
      (!(job.flags! & SchedulerJobFlags.PRE) && jobId >= getId(lastJob))
    ) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job)
    }

    // 标记任务为已入队
job.flags! |= SchedulerJobFlags.QUEUED

    // 触发队列刷新
queueFlush()
  }
}

/**
 * 调度队列的刷新
 * 如果当前没有刷新Promise，则创建一个
 */
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

/**
 * 将回调添加到后刷新队列
 * @param cb 要添加的回调或回调数组
 */
export function queuePostFlushCb(cb: SchedulerJobs): void {
  if (!isArray(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb)
    } else if (!(cb.flags! & SchedulerJobFlags.QUEUED)) {
      pendingPostFlushCbs.push(cb)
      cb.flags! |= SchedulerJobFlags.QUEUED
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    pendingPostFlushCbs.push(...cb)
  }
  queueFlush()
}

/**
 * 刷新预更新回调队列
 * @param instance 可选的组件实例，用于过滤特定组件的回调
 * @param seen 用于检测递归更新的计数映射
 * @param i 开始索引
 */
export function flushPreFlushCbs(
  instance?: ComponentInternalInstance,
  seen?: CountMap,
  // skip the current job
  i: number = flushIndex + 1,
): void {
  if (__DEV__) {
    seen = seen || new Map()
  }
  for (; i < queue.length; i++) {
    const cb = queue[i]
    if (cb && cb.flags! & SchedulerJobFlags.PRE) {
      if (instance && cb.id !== instance.uid) {
        continue
      }
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      queue.splice(i, 1)
      i--
      if (cb.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
      cb()
      if (!(cb.flags! & SchedulerJobFlags.ALLOW_RECURSE)) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
    }
  }
}

/**
 * 刷新后更新回调队列
 * @param seen 用于检测递归更新的计数映射
 */
export function flushPostFlushCbs(seen?: CountMap): void {
  if (pendingPostFlushCbs.length) {
    // 去重并按任务ID排序
const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b),
    )
    // 清空待处理队列
pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }

    // 设置当前激活的后刷新回调队列
activePostFlushCbs = deduped
    if (__DEV__) {
      seen = seen || new Map()
    }

    // 遍历并执行所有后刷新回调
for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      const cb = activePostFlushCbs[postFlushIndex]
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      if (cb.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
        cb.flags! &= ~SchedulerJobFlags.QUEUED
      }
      // 如果任务未被处置，则执行
if (!(cb.flags! & SchedulerJobFlags.DISPOSED)) cb()
      cb.flags! &= ~SchedulerJobFlags.QUEUED
    }
    // 清空激活的后刷新回调队列
activePostFlushCbs = null
    postFlushIndex = 0
  }
}

/**
 * 获取任务的ID
 * @param job 任务对象
 * @returns 任务ID
 */
const getId = (job: SchedulerJob): number =>
  job.id == null ? (job.flags! & SchedulerJobFlags.PRE ? -1 : Infinity) : job.id

/**
 * 刷新所有任务队列
 * @param seen 用于检测递归更新的计数映射
 */
function flushJobs(seen?: CountMap) {
  if (__DEV__) {
    seen = seen || new Map()
  }

  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP

  try {
    // 遍历并执行所有队列中的任务
for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job && !(job.flags! & SchedulerJobFlags.DISPOSED)) {
        if (__DEV__ && check(job)) {
          continue
        }
        if (job.flags! & SchedulerJobFlags.ALLOW_RECURSE) {
          job.flags! &= ~SchedulerJobFlags.QUEUED
        }
        // 带错误处理的执行任务
callWithErrorHandling(
          job,
          job.i,
          job.i ? ErrorCodes.COMPONENT_UPDATE : ErrorCodes.SCHEDULER,
        )
        if (!(job.flags! & SchedulerJobFlags.ALLOW_RECURSE)) {
          job.flags! &= ~SchedulerJobFlags.QUEUED
        }
      }
    }
  } finally {
    // If there was an error we still need to clear the QUEUED flags
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        job.flags! &= ~SchedulerJobFlags.QUEUED
      }
    }

    flushIndex = -1
    // 清空队列
queue.length = 0

    // 刷新后更新回调队列
flushPostFlushCbs(seen)

    // 重置当前刷新Promise
currentFlushPromise = null
    // If new jobs have been added to either queue, keep flushing
    // 如果还有任务或后刷新回调，则继续刷新
if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}

/**
 * 检查递归更新
 * @param seen 计数映射，记录每个任务的执行次数
 * @param fn 要检查的任务
 * @returns 如果超过递归限制则返回true
 */
function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob) {
  const count = seen.get(fn) || 0
  if (count > RECURSION_LIMIT) {
    const instance = fn.i
    const componentName = instance && getComponentName(instance.type)
    handleError(
      `Maximum recursive updates exceeded${
        componentName ? ` in component <${componentName}>` : ``
      }. ` +
        `This means you have a reactive effect that is mutating its own ` +
        `dependencies and thus recursively triggering itself. Possible sources ` +
        `include component template, render function, updated hook or ` +
        `watcher source function.`,
      null,
      ErrorCodes.APP_ERROR_HANDLER,
    )
    return true
  }
  seen.set(fn, count + 1)
  return false
}
