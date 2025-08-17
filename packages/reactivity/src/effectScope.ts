/**
 * Vue 响应式系统效果作用域实现
 * 该文件定义了 EffectScope 类，用于管理响应式效果的作用域，
 * 可以捕获和管理在其内部创建的响应式效果（如计算属性和监听器）
 */
import type { ReactiveEffect } from './effect'
import { warn } from './warning'

/**
 * 当前活动的效果作用域
 */
export let activeEffectScope: EffectScope | undefined

/**
 * 效果作用域类
 * 用于捕获和管理响应式效果的生命周期
 */
export class EffectScope {
  /**
   * 作用域是否激活
   * @internal
   */
  private _active = true
  /**
   * 跟踪 `on` 调用次数，允许多次调用 `on`
   * @internal
   */
  private _on = 0
  /**
   * 存储此作用域内的所有响应式效果
   * @internal
   */
  effects: ReactiveEffect[] = []
  /**
   * 存储清理函数
   * @internal
   */
  cleanups: (() => void)[] = []

  /**
   * 作用域是否已暂停
   */
  private _isPaused = false

  /**
   * 父作用域，仅由非分离的作用域赋值
   * @internal
   */
  parent: EffectScope | undefined
  /**
   * 记录未分离的子作用域
   * @internal
   */
  scopes: EffectScope[] | undefined
  /**
   * 跟踪子作用域在其父作用域 scopes 数组中的索引，用于优化移除操作
   * @internal
   */
  private index: number | undefined

  /**
   * 构造函数
   * @param detached - 是否创建一个"分离的"效果作用域
   */
  constructor(public detached = false) {
    this.parent = activeEffectScope
    if (!detached && activeEffectScope) {
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }

  /**
   * 获取作用域是否激活
   */
  get active(): boolean {
    return this._active
  }

  /**
   * 暂停作用域
   * 暂停此作用域及其所有子作用域和效果
   */
  pause(): void {
    if (this._active) {
      this._isPaused = true
      let i, l
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause()
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause()
      }
    }
  }

  /**
   * 恢复作用域
   * 恢复此作用域及其所有子作用域和效果
   */
  resume(): void {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false
        let i, l
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume()
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume()
        }
      }
    }
  }

  /**
   * 在作用域内运行函数
   * @param fn - 要运行的函数
   * @returns 函数的返回值，如果作用域未激活则返回 undefined
   */
  run<T>(fn: () => T): T | undefined {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        activeEffectScope = this
        return fn()
      } finally {
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  /**
   * 前一个作用域
   */
  prevScope: EffectScope | undefined
  /**
   * 激活当前作用域
   * 只能在非分离的作用域上调用
   * @internal
   */
  on(): void {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope
      activeEffectScope = this
    }
  }

  /**
   * 停用当前作用域
   * 只能在非分离的作用域上调用
   * @internal
   */
  off(): void {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope
      this.prevScope = undefined
    }
  }

  /**
   * 停止作用域
   * 清理所有效果、子作用域和清理函数
   * @param fromParent - 是否由父作用域触发的停止
   */
  stop(fromParent?: boolean): void {
    if (this._active) {
      this._active = false
      let i, l
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      this.effects.length = 0

      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      this.cleanups.length = 0

      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
        this.scopes.length = 0
      }

      // nested scope, dereference from parent to avoid memory leaks
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        const last = this.parent.scopes!.pop()
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last
          last.index = this.index!
        }
      }
      this.parent = undefined
    }
  }
}

/**
 * 创建一个效果作用域对象
 * 可以捕获在其内部创建的响应式效果（如计算属性和监听器），以便这些效果可以一起被销毁
 *
 * @param detached - 是否创建一个"分离的"效果作用域
 * @returns 新创建的效果作用域
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached)
}

/**
 * 获取当前活动的效果作用域（如果有）
 *
 * @returns 当前活动的效果作用域，或 undefined
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope
}

/**
 * 在当前活动的效果作用域上注册一个清理回调
 * 当关联的效果作用域停止时，将调用该回调
 *
 * @param fn - 要附加到作用域清理的回调函数
 * @param failSilently - 如果没有活动作用域，是否静默失败而不警告
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
