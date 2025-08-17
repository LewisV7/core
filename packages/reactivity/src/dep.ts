/**
 * Vue 响应式系统依赖追踪实现
 * 该文件定义了依赖追踪的核心类和函数，包括 Dep、Link 以及 track/trigger 机制
 */
import { extend, isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import { type TrackOpTypes, TriggerOpTypes } from './constants'
import {
  type DebuggerEventExtraInfo,
  EffectFlags,
  type Subscriber,
  activeSub,
  endBatch,
  shouldTrack,
  startBatch,
} from './effect'

/**
 * 全局版本号，每次响应式变化时递增
 * 用于计算属性的快速路径，当没有变化时避免重新计算
 */
export let globalVersion = 0

/**
 * 表示源（Dep）和订阅者（Effect 或 Computed）之间的链接
 * Dep 和订阅者之间是多对多关系 - 每个 Dep 和订阅者之间的链接由一个 Link 实例表示
 *
 * Link 同时是两个双向链表中的节点 - 一个用于关联的订阅者跟踪其所有依赖，
 * 另一个用于关联的依赖跟踪其所有订阅者
 *
 * @internal
 */
export class Link {
  /**
   * 版本号，用于跟踪依赖是否被使用
   * - 在每个 effect 运行前，所有先前的依赖链接版本都重置为 -1
   * - 运行期间，链接的版本在访问时与源依赖同步
   * - 运行后，版本为 -1 的链接（从未使用过）将被清理
   */
  version: number

  /**
   * 双向链表指针
   */
  nextDep?: Link  // 指向下一个依赖链接
  prevDep?: Link  // 指向前一个依赖链接
  nextSub?: Link  // 指向下一个订阅者链接
  prevSub?: Link  // 指向前一个订阅者链接
  prevActiveLink?: Link  // 指向前一个活动链接

  /**
   * 构造函数
   * @param sub - 订阅者（Effect 或 Computed）
   * @param dep - 依赖对象
   */
  constructor(
    public sub: Subscriber,
    public dep: Dep,
  ) {
    this.version = dep.version
    this.nextDep =
      this.prevDep =
      this.nextSub =
      this.prevSub =
      this.prevActiveLink =
        undefined
  }
}

/**
 * 依赖类，管理对某个响应式属性的所有订阅者
 * @internal
 */
export class Dep {
  version = 0  // 当前依赖的版本号
  /**
   * 当前依赖与当前活动 effect 之间的链接
   */
  activeLink?: Link = undefined

  /**
   * 表示订阅效果的双向链表（尾部）
   */
  subs?: Link = undefined

  /**
   * 表示订阅效果的双向链表（头部）
   * 仅开发环境使用，用于按正确顺序调用 onTrigger 钩子
   */
  subsHead?: Link

  /**
   * 用于对象属性依赖清理
   */
  map?: KeyToDepMap = undefined  // 依赖映射
  key?: unknown = undefined  // 依赖的键

  /**
   * 订阅者计数器
   */
  sc: number = 0

  /**
   * 内部标志，用于跳过响应式处理
   * @internal
   */
  readonly __v_skip = true
  // TODO isolatedDeclarations ReactiveFlags.SKIP

  /**
   * 构造函数
   * @param computed - 可选的计算属性引用
   */
  constructor(public computed?: ComputedRefImpl | undefined) {
    if (__DEV__) {
      this.subsHead = undefined
    }
  }

  /**
   * 跟踪当前活动 effect 对依赖的访问
   * @param debugInfo - 可选的调试信息
   * @returns 新创建或更新的链接对象
   */
  track(debugInfo?: DebuggerEventExtraInfo): Link | undefined {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return
    }

    let link = this.activeLink
    if (link === undefined || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this)

      // add the link to the activeEffect as a dep (as tail)
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link
      } else {
        link.prevDep = activeSub.depsTail
        activeSub.depsTail!.nextDep = link
        activeSub.depsTail = link
      }

      addSub(link)
    } else if (link.version === -1) {
      // reused from last run - already a sub, just sync version
      link.version = this.version

      // If this dep has a next, it means it's not at the tail - move it to the
      // tail. This ensures the effect's dep list is in the order they are
      // accessed during evaluation.
      if (link.nextDep) {
        const next = link.nextDep
        next.prevDep = link.prevDep
        if (link.prevDep) {
          link.prevDep.nextDep = next
        }

        link.prevDep = activeSub.depsTail
        link.nextDep = undefined
        activeSub.depsTail!.nextDep = link
        activeSub.depsTail = link

        // this was the head - point to the new head
        if (activeSub.deps === link) {
          activeSub.deps = next
        }
      }
    }

    if (__DEV__ && activeSub.onTrack) {
      activeSub.onTrack(
        extend(
          {
            effect: activeSub,
          },
          debugInfo,
        ),
      )
    }

    return link
  }

  /**
   * 触发依赖更新
   * @param debugInfo - 可选的调试信息
   */
  trigger(debugInfo?: DebuggerEventExtraInfo): void {
    this.version++
    globalVersion++
    this.notify(debugInfo)
  }

  /**
   * 通知所有订阅者
   * @param debugInfo - 可选的调试信息
   */
  notify(debugInfo?: DebuggerEventExtraInfo): void {
    startBatch()
    try {
      if (__DEV__) {
        // subs are notified and batched in reverse-order and then invoked in
        // original order at the end of the batch, but onTrigger hooks should
        // be invoked in original order here.
        for (let head = this.subsHead; head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & EffectFlags.NOTIFIED)) {
            head.sub.onTrigger(
              extend(
                {
                  effect: head.sub,
                },
                debugInfo,
              ),
            )
          }
        }
      }
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          // if notify() returns `true`, this is a computed. Also call notify
          // on its dep - it's called here instead of inside computed's notify
          // in order to reduce call stack depth.
          ;(link.sub as ComputedRefImpl).dep.notify()
        }
      }
    } finally {
      endBatch()
    }
  }
}

/**
 * 添加订阅链接到依赖
 * @param link - 要添加的链接对象
 */
function addSub(link: Link) {
  link.dep.sc++
  if (link.sub.flags & EffectFlags.TRACKING) {
    const computed = link.dep.computed
    // computed getting its first subscriber
    // enable tracking + lazily subscribe to all its deps
    if (computed && !link.dep.subs) {
      computed.flags |= EffectFlags.TRACKING | EffectFlags.DIRTY
      for (let l = computed.deps; l; l = l.nextDep) {
        addSub(l)
      }
    }

    const currentTail = link.dep.subs
    if (currentTail !== link) {
      link.prevSub = currentTail
      if (currentTail) currentTail.nextSub = link
    }

    if (__DEV__ && link.dep.subsHead === undefined) {
      link.dep.subsHead = link
    }

    link.dep.subs = link
  }
}

/**
 * 存储 {target -> key -> dep} 连接的主 WeakMap
 * 概念上，可以将依赖视为维护订阅者集合的 Dep 类，
 * 但为了减少内存开销，我们简单地将它们存储为原始 Maps
 */
type KeyToDepMap = Map<any, Dep>

/**
 * 目标对象到依赖映射的 WeakMap
 */
export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap()

/**
 * 对象迭代的唯一符号键
 */
export const ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Object iterate' : '',
)
/**
 * Map 键迭代的唯一符号键
 */
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Map keys iterate' : '',
)
/**
 * 数组迭代的唯一符号键
 */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(
  __DEV__ ? 'Array iterate' : '',
)

/**
 * 跟踪对响应式属性的访问
 *
 * 这将检查当前运行的 effect，并将其记录为依赖，
 * 该依赖记录了所有依赖于响应式属性的 effect
 *
 * @param target - 包含响应式属性的对象
 * @param type - 定义对响应式属性的访问类型
 * @param key - 要跟踪的响应式属性的标识符
 */
export function track(target: object, type: TrackOpTypes, key: unknown): void {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Dep()))
      dep.map = depsMap
      dep.key = key
    }
    if (__DEV__) {
      dep.track({
        target,
        type,
        key,
      })
    } else {
      dep.track()
    }
  }
}

/**
 * 查找与目标（或特定属性）关联的所有依赖并触发其中存储的 effect
 *
 * @param target - 响应式对象
 * @param type - 定义需要触发 effect 的操作类型
 * @param key - 可用于定位目标对象中的特定响应式属性
 * @param newValue - 新值
 * @param oldValue - 旧值
 * @param oldTarget - 旧的目标集合（用于 Map 和 Set）
 */
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
): void {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    globalVersion++
    return
  }

  const run = (dep: Dep | undefined) => {
    if (dep) {
      if (__DEV__) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget,
        })
      } else {
        dep.trigger()
      }
    }
  }

  startBatch()

  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    depsMap.forEach(run)
  } else {
    const targetIsArray = isArray(target)
    const isArrayIndex = targetIsArray && isIntegerKey(key)

    if (targetIsArray && key === 'length') {
      const newLength = Number(newValue)
      depsMap.forEach((dep, key) => {
        if (
          key === 'length' ||
          key === ARRAY_ITERATE_KEY ||
          (!isSymbol(key) && key >= newLength)
        ) {
          run(dep)
        }
      })
    } else {
      // schedule runs for SET | ADD | DELETE
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key))
      }

      // schedule ARRAY_ITERATE for any numeric key change (length is handled above)
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY))
      }

      // also run for iteration key on ADD | DELETE | Map.SET
      switch (type) {
        case TriggerOpTypes.ADD:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          } else if (isArrayIndex) {
            // new index added to array -> length changes
            run(depsMap.get('length'))
          }
          break
        case TriggerOpTypes.DELETE:
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          }
          break
        case TriggerOpTypes.SET:
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY))
          }
          break
      }
    }
  }

  endBatch()
}

/**
 * 从响应式对象获取依赖
 * @param object - 响应式对象
 * @param key - 属性键
 * @returns 依赖对象或 undefined
 */
export function getDepFromReactive(
  object: any,
  key: string | number | symbol,
): Dep | undefined {
  const depMap = targetMap.get(object)
  return depMap && depMap.get(key)
}
