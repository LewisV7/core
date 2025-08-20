// 导入Vue运行时核心模块中的类型和工具函数
import {
  type ComponentInternalInstance,
  DeprecationTypes,
  type Directive,
  type LegacyConfig,
  compatUtils,
  getCurrentInstance,
} from '@vue/runtime-core'
// 导入Vue共享模块中的工具函数
import { hyphenate, isArray } from '@vue/shared'

// 系统修饰键列表
const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'] as const
// 系统修饰键类型，由系统修饰符列表推导而来
type SystemModifiers = (typeof systemModifiers)[number]
// 兼容修饰键类型，由keyNames对象的键推导而来
type CompatModifiers = keyof typeof keyNames

/**
 * v-on指令支持的修饰符类型
 * @typedef {SystemModifiers | ModifierGuards | CompatModifiers} VOnModifiers
 * @description 可以是系统修饰符、守卫修饰符或兼容修饰符
 */
export type VOnModifiers = SystemModifiers | ModifierGuards | CompatModifiers
// 键盘、鼠标和触摸事件的联合类型
type KeyedEvent = KeyboardEvent | MouseEvent | TouchEvent

/**
 * 修饰符守卫类型
 * @typedef {string} ModifierGuards
 * @description 定义了可用于v-on指令的各种事件修饰符
 * @property {'stop'} stop - 阻止事件传播
 * @property {'prevent'} prevent - 阻止默认事件
 * @property {'self'} self - 仅当事件目标是元素自身时触发
 * @property {'ctrl'} ctrl - 仅当按下ctrl键时触发
 * @property {'shift'} shift - 仅当按下shift键时触发
 * @property {'alt'} alt - 仅当按下alt键时触发
 * @property {'meta'} meta - 仅当按下meta键时触发
 * @property {'left'} left - 仅当鼠标左键点击时触发
 * @property {'middle'} middle - 仅当鼠标中键点击时触发
 * @property {'right'} right - 仅当鼠标右键点击时触发
 * @property {'exact'} exact - 仅当精确匹配修饰符组合时触发
 */
type ModifierGuards =
  | 'shift'
  | 'ctrl'
  | 'alt'
  | 'meta'
  | 'left'
  | 'right'
  | 'stop'
  | 'prevent'
  | 'self'
  | 'middle'
  | 'exact'
/**
 * 修饰符守卫对象
 * @type {Record<ModifierGuards, Function>}
 * @description 包含各种事件修饰符对应的处理函数
 */
const modifierGuards: Record<
  ModifierGuards,
  | ((e: Event) => void | boolean)
  | ((e: Event, modifiers: string[]) => void | boolean)
> = {
  // 阻止事件传播
  stop: (e: Event) => e.stopPropagation(),
  // 阻止默认事件
  prevent: (e: Event) => e.preventDefault(),
    // 仅当事件目标是元素自身时触发（返回true表示不触发）
    self: (e: Event) => e.target !== e.currentTarget,
    // 仅当按下ctrl键时触发（返回true表示不触发）
    ctrl: (e: Event) => !(e as KeyedEvent).ctrlKey,
    // 仅当按下shift键时触发（返回true表示不触发）
    shift: (e: Event) => !(e as KeyedEvent).shiftKey,
    // 仅当按下alt键时触发（返回true表示不触发）
    alt: (e: Event) => !(e as KeyedEvent).altKey,
    // 仅当按下meta键时触发（返回true表示不触发）
    meta: (e: Event) => !(e as KeyedEvent).metaKey,
    // 仅当鼠标左键点击时触发（返回true表示不触发）
    left: (e: Event) => 'button' in e && (e as MouseEvent).button !== 0,
    // 仅当鼠标中键点击时触发（返回true表示不触发）
    middle: (e: Event) => 'button' in e && (e as MouseEvent).button !== 1,
    // 仅当鼠标右键点击时触发（返回true表示不触发）
    right: (e: Event) => 'button' in e && (e as MouseEvent).button !== 2,
  // 仅当精确匹配修饰符组合时触发
  // 如果按下了系统修饰符但未在modifiers中包含，则返回true表示不触发
  exact: (e, modifiers) =>
    systemModifiers.some(m => (e as any)[`${m}Key`] && !modifiers.includes(m)),
}

/**
 * 为事件处理函数添加修饰符功能
 * @template T - 事件处理函数类型
 * @param {T & { _withMods?: { [key: string]: T } }} fn - 原始事件处理函数
 * @param {VOnModifiers[]} modifiers - 要应用的修饰符数组
 * @returns {T} - 包装后的事件处理函数
 * @description 为事件处理函数添加修饰符功能，并使用缓存优化性能
 * @private
 */
export const withModifiers = <
  T extends (event: Event, ...args: unknown[]) => any,
>(
  fn: T & { _withMods?: { [key: string]: T } },
  modifiers: VOnModifiers[],
): T => {
  // 获取或创建缓存对象，用于存储已包装的函数
  const cache = fn._withMods || (fn._withMods = {})
  // 生成缓存键，用于标识不同的修饰符组合
  const cacheKey = modifiers.join('.')
  // 返回缓存的函数或创建新的包装函数
  return (
    cache[cacheKey] ||
    (cache[cacheKey] = ((event, ...args) => {
      // 遍历所有修饰符
      for (let i = 0; i < modifiers.length; i++) {
        const guard = modifierGuards[modifiers[i] as ModifierGuards]
        // 如果修饰符存在且返回true，则不执行原始函数
        if (guard && guard(event, modifiers)) return
      }
      // 所有修饰符条件通过，执行原始函数
      return fn(event, ...args)
    }) as T)
  )
}

// 为2.x版本兼容性保留的键名映射
// 注意：目前已移除对IE11的`spacebar`和`del`兼容性支持
/**
 * 键名映射对象
 * @type {Record<'esc' | 'space' | 'up' | 'left' | 'right' | 'down' | 'delete', string>}
 * @description 将简写键名映射到标准键名
 */
const keyNames: Record<
  'esc' | 'space' | 'up' | 'left' | 'right' | 'down' | 'delete',
  string
> = {
  // 将'esc'映射到标准键名'escape'
  esc: 'escape',
  // 将'space'映射到空格键
  space: ' ',
  // 将'up'映射到'arrow-up'
  up: 'arrow-up',
  // 将'left'映射到'arrow-left'
  left: 'arrow-left',
  // 将'right'映射到'arrow-right'
  right: 'arrow-right',
  // 将'down'映射到'arrow-down'
  down: 'arrow-down',
  // 将'delete'映射到'backspace'
  delete: 'backspace',
}

/**
 * 为键盘事件处理函数添加按键修饰符功能
 * @template T - 键盘事件处理函数类型
 * @param {T & { _withKeys?: { [k: string]: T } }} fn - 原始键盘事件处理函数
 * @param {string[]} modifiers - 要应用的按键修饰符数组
 * @returns {T} - 包装后的键盘事件处理函数
 * @description 为键盘事件处理函数添加按键修饰符功能，并支持2.x版本的兼容性处理
 * @private
 */
export const withKeys = <T extends (event: KeyboardEvent) => any>(
  fn: T & { _withKeys?: { [k: string]: T } },
  modifiers: string[],
): T => {
  // 声明全局键码和组件实例变量
  let globalKeyCodes: LegacyConfig['keyCodes']
  let instance: ComponentInternalInstance | null = null
  // 处理兼容性逻辑
  if (__COMPAT__) {
    // 获取当前组件实例
    instance = getCurrentInstance()
    // 检查是否启用了CONFIG_KEY_CODES兼容性
    if (
      compatUtils.isCompatEnabled(DeprecationTypes.CONFIG_KEY_CODES, instance)
    ) {
      if (instance) {
        // 获取全局键码配置
        globalKeyCodes = (instance.appContext.config as LegacyConfig).keyCodes
      }
    }
    // 开发环境下，如果modifiers中包含数字（键码），发出警告
    if (__DEV__ && modifiers.some(m => /^\d+$/.test(m))) {
      compatUtils.warnDeprecation(
        DeprecationTypes.V_ON_KEYCODE_MODIFIER,
        instance,
      )
    }
  }

  // 获取或创建缓存对象，用于存储已包装的函数
  const cache: { [k: string]: T } = fn._withKeys || (fn._withKeys = {})
  const cacheKey = modifiers.join('.')

  // 返回缓存的函数或创建新的包装函数
  return (
    cache[cacheKey] ||
    (cache[cacheKey] = (event => {
      // 检查事件是否有key属性
      if (!('key' in event)) {
        return
      }

      // 将事件的key转换为连字符格式
      const eventKey = hyphenate(event.key)
      // 检查是否匹配修饰符中的键名或键名映射
      if (
        modifiers.some(
          k =>
            k === eventKey ||
            keyNames[k as unknown as CompatModifiers] === eventKey,
        )
      ) {
        return fn(event)
      }

      // 处理兼容性逻辑
      if (__COMPAT__) {
        const keyCode = String(event.keyCode)
        // 检查是否匹配键码修饰符
        if (
          compatUtils.isCompatEnabled(
            DeprecationTypes.V_ON_KEYCODE_MODIFIER,
            instance,
          ) &&
          modifiers.some(mod => mod == keyCode)
        ) {
          return fn(event)
        }
        // 检查是否匹配全局键码配置
        if (globalKeyCodes) {
          for (const mod of modifiers) {
            const codes = globalKeyCodes[mod]
            if (codes) {
              const matches = isArray(codes)
                ? codes.some(code => String(code) === keyCode)
                : String(codes) === keyCode
              if (matches) {
                return fn(event)
              }
            }
          }
        }
      }
    }) as T)
  )
}

/**
 * v-on指令的类型定义
 * @typedef {Directive<any, any, VOnModifiers>} VOnDirective
 * @description 定义了v-on指令的完整类型，包括：
 * - 第一个类型参数：绑定值的类型
 * - 第二个类型参数：指令参数的类型
 * - 第三个类型参数：指令修饰符的类型，限制为VOnModifiers
 * @example
 * // 使用示例
 * const vOn: VOnDirective = {}
 * @public
 */
export type VOnDirective = Directive<any, any, VOnModifiers>
