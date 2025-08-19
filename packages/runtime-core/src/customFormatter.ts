/**
 * Vue 自定义格式化器
 * 用于在 Chrome 开发者工具中优化 Vue 相关对象的显示
 */
import {
  type Ref,
  isReactive,
  isReadonly,
  isRef,
  isShallow,
  pauseTracking,
  resetTracking,
  toRaw,
} from '@vue/reactivity'
import { EMPTY_OBJ, extend, isArray, isFunction, isObject } from '@vue/shared'
import type { ComponentInternalInstance, ComponentOptions } from './component'
import type { ComponentPublicInstance } from './componentPublicInstance'

/**
 * 初始化自定义格式化器
 * 在开发环境下为 Chrome 开发者工具注册 Vue 自定义对象格式化器
 * 用于优化 Vue 实例、响应式对象、Ref 等在控制台中的显示
 */
export function initCustomFormatter(): void {
  /* eslint-disable no-restricted-globals */
  // 只在开发环境和浏览器环境下初始化
  if (!__DEV__ || typeof window === 'undefined') {
    return
  }

  const vueStyle = { style: 'color:#3ba776' }
  const numberStyle = { style: 'color:#1677ff' }
  const stringStyle = { style: 'color:#f5222d' }
  const keywordStyle = { style: 'color:#eb2f96' }

  /**
   * Chrome 自定义格式化器
   * 实现 Chrome 开发者工具的自定义对象格式化器接口
   * 用于自定义 Vue 相关对象在控制台中的显示方式
   * @see https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html
   */
  const formatter = {
    __vue_custom_formatter: true,
    header(obj: unknown) {
      // TODO also format ComponentPublicInstance & ctx.slots/attrs in setup
      if (!isObject(obj)) {
        return null
      }

      if (obj.__isVue) {
        return ['div', vueStyle, `VueInstance`]
      } else if (isRef(obj)) {
        // avoid tracking during debugger accessing
        pauseTracking()
        const value = obj.value
        resetTracking()
        return [
          'div',
          {},
          ['span', vueStyle, genRefFlag(obj)],
          '<',
          formatValue(value),
          `>`,
        ]
      } else if (isReactive(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReactive' : 'Reactive'],
          '<',
          formatValue(obj),
          `>${isReadonly(obj) ? ` (readonly)` : ``}`,
        ]
      } else if (isReadonly(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReadonly' : 'Readonly'],
          '<',
          formatValue(obj),
          '>',
        ]
      }
      return null
    },
    hasBody(obj: unknown) {
      return obj && (obj as any).__isVue
    },
    body(obj: unknown) {
      if (obj && (obj as any).__isVue) {
        return [
          'div',
          {},
          ...formatInstance((obj as ComponentPublicInstance).$),
        ]
      }
    },
  }

  /**
   * 格式化组件实例
   * @param instance - 组件内部实例
   * @returns 格式化后的组件实例信息块
   */
  function formatInstance(instance: ComponentInternalInstance) {
    const blocks = []
    if (instance.type.props && instance.props) {
      blocks.push(createInstanceBlock('props', toRaw(instance.props)))
    }
    if (instance.setupState !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('setup', instance.setupState))
    }
    if (instance.data !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('data', toRaw(instance.data)))
    }
    const computed = extractKeys(instance, 'computed')
    if (computed) {
      blocks.push(createInstanceBlock('computed', computed))
    }
    const injected = extractKeys(instance, 'inject')
    if (injected) {
      blocks.push(createInstanceBlock('injected', injected))
    }

    blocks.push([
      'div',
      {},
      [
        'span',
        {
          style: keywordStyle.style + ';opacity:0.66',
        },
        '$ (internal): ',
      ],
      ['object', { object: instance }],
    ])
    return blocks
  }

  /**
   * 创建实例信息块
   * @param type - 信息块类型（props、setup、data等）
   * @param target - 目标对象
   * @returns 格式化后的信息块
   */
  function createInstanceBlock(type: string, target: any) {
    target = extend({}, target)
    if (!Object.keys(target).length) {
      return ['span', {}]
    }
    return [
      'div',
      { style: 'line-height:1.25em;margin-bottom:0.6em' },
      [
        'div',
        {
          style: 'color:#476582',
        },
        type,
      ],
      [
        'div',
        {
          style: 'padding-left:1.25em',
        },
        ...Object.keys(target).map(key => {
          return [
            'div',
            {},
            ['span', keywordStyle, key + ': '],
            formatValue(target[key], false),
          ]
        }),
      ],
    ]
  }

  /**
   * 格式化值
   * @param v - 要格式化的值
   * @param asRaw - 是否使用原始值
   * @returns 格式化后的显示内容
   */
  function formatValue(v: unknown, asRaw = true) {
    if (typeof v === 'number') {
      return ['span', numberStyle, v]
    } else if (typeof v === 'string') {
      return ['span', stringStyle, JSON.stringify(v)]
    } else if (typeof v === 'boolean') {
      return ['span', keywordStyle, v]
    } else if (isObject(v)) {
      return ['object', { object: asRaw ? toRaw(v) : v }]
    } else {
      return ['span', stringStyle, String(v)]
    }
  }

  /**
   * 提取指定类型的键
   * @param instance - 组件内部实例
   * @param type - 键类型（computed、inject等）
   * @returns 提取的键值对
   */
  function extractKeys(instance: ComponentInternalInstance, type: string) {
    const Comp = instance.type
    if (isFunction(Comp)) {
      return
    }
    const extracted: Record<string, any> = {}
    for (const key in instance.ctx) {
      if (isKeyOfType(Comp, key, type)) {
        extracted[key] = instance.ctx[key]
      }
    }
    return extracted
  }

  /**
   * 判断键是否为指定类型
   * @param Comp - 组件选项
   * @param key - 键名
   * @param type - 类型
   * @returns 是否为指定类型的键
   */
  function isKeyOfType(Comp: ComponentOptions, key: string, type: string) {
    const opts = Comp[type]
    if (
      (isArray(opts) && opts.includes(key)) ||
      (isObject(opts) && key in opts)
    ) {
      return true
    }
    if (Comp.extends && isKeyOfType(Comp.extends, key, type)) {
      return true
    }
    if (Comp.mixins && Comp.mixins.some(m => isKeyOfType(m, key, type))) {
      return true
    }
  }

  /**
   * 生成 Ref 标志
   * @param v - Ref 对象
   * @returns Ref 类型标志字符串
   */
  function genRefFlag(v: Ref) {
    if (isShallow(v)) {
      return `ShallowRef`
    }
    if ((v as any).effect) {
      return `ComputedRef`
    }
    return `Ref`
  }

  if ((window as any).devtoolsFormatters) {
    ;(window as any).devtoolsFormatters.push(formatter)
  } else {
    ;(window as any).devtoolsFormatters = [formatter]
  }
}
