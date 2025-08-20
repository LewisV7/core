// 导入Vue运行时核心模块中的类型和工具函数
import {
  type DirectiveBinding, // 指令绑定类型
  type DirectiveHook, // 指令钩子函数类型
  type ObjectDirective, // 对象指令类型
  type VNode, // 虚拟节点类型
  nextTick, // 在下一个DOM更新周期执行回调
  warn, // 警告函数
} from '@vue/runtime-core'
// 导入事件监听模块
import { addEventListener } from '../modules/events'
// 导入共享工具函数
import {
  invokeArrayFns, // 调用数组中的所有函数
  isArray, // 判断是否为数组
  isSet, // 判断是否为Set
  looseEqual, // 宽松相等比较
  looseIndexOf, // 宽松索引查找
  looseToNumber, // 宽松转换为数字
} from '@vue/shared'

/**
 * 模型赋值函数类型
 * @param value 要赋给模型的值
 */
type AssignerFn = (value: any) => void

/**
 * 获取模型赋值函数
 * @param vnode 虚拟节点
 * @returns 赋值函数
 */
const getModelAssigner = (vnode: VNode): AssignerFn => {
  // 优先获取onUpdate:modelValue，兼容模式下获取onModelCompat:input
  const fn =
    vnode.props!['onUpdate:modelValue'] ||
    (__COMPAT__ && vnode.props!['onModelCompat:input'])
  // 如果是函数数组，则调用invokeArrayFns，否则直接返回函数
  return isArray(fn) ? value => invokeArrayFns(fn, value) : fn
}

/**
 * 输入法组合开始时的处理函数
 * @param e 事件对象
 */
function onCompositionStart(e: Event) {
  // 标记当前正在组合输入
  ;(e.target as any).composing = true
}

/**
 * 输入法组合结束时的处理函数
 * @param e 事件对象
 */
function onCompositionEnd(e: Event) {
  const target = e.target as any
  if (target.composing) {
    // 结束组合输入状态
    target.composing = false
    // 手动触发input事件
    target.dispatchEvent(new Event('input'))
  }
}

/**
 * 赋值函数的键，用于在元素上存储赋值函数
 */
const assignKey: unique symbol = Symbol('_assign')

/**
 * 模型指令类型
 * @template T 元素类型
 * @template Modifiers 修饰符类型
 */
type ModelDirective<T, Modifiers extends string = string> = ObjectDirective<
  T & { [assignKey]: AssignerFn; _assigning?: boolean }, // 扩展元素类型，添加赋值函数和赋值中标记
  any,
  Modifiers
>

// 导出v-model文本指令实现，直接作为虚拟节点钩子函数，以便在未使用时可以被树摇
/**
 * 文本输入和文本区域的v-model指令
 * @type {ModelDirective<HTMLInputElement | HTMLTextAreaElement, 'trim' | 'number' | 'lazy'>}
 */
export const vModelText: ModelDirective<
  HTMLInputElement | HTMLTextAreaElement,
  'trim' | 'number' | 'lazy'
> = {
  /**
   * 指令创建时的钩子
   * @param el 元素
   * @param modifiers 修饰符
   * @param vnode 虚拟节点
   */
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    // 存储赋值函数
    el[assignKey] = getModelAssigner(vnode)
    // 是否需要转换为数字
    const castToNumber =
      number || (vnode.props && vnode.props.type === 'number')
    // 根据lazy修饰符决定监听change还是input事件
    addEventListener(el, lazy ? 'change' : 'input', e => {
      // 如果正在组合输入，则不处理
      if ((e.target as any).composing) return
      let domValue: string | number = el.value
      // 应用trim修饰符
      if (trim) {
        domValue = domValue.trim()
      }
      // 应用number修饰符
      if (castToNumber) {
        domValue = looseToNumber(domValue)
      }
      // 更新模型值
      el[assignKey](domValue)
    })
    // 如果有trim修饰符，在change事件中也进行修剪
    if (trim) {
      addEventListener(el, 'change', () => {
        el.value = el.value.trim()
      })
    }
    // 非lazy模式下，处理输入法组合输入
    if (!lazy) {
      addEventListener(el, 'compositionstart', onCompositionStart)
      addEventListener(el, 'compositionend', onCompositionEnd)
      // Safari < 10.2 & UIWebView在确认组合选择前切换焦点时不会触发compositionend
      // 这也修复了一些浏览器（如iOS Chrome）在自动完成时触发"change"而不是"input"的问题
      addEventListener(el, 'change', onCompositionEnd)
    }
  },
  /**
   * 指令挂载时的钩子
   * @param el 元素
   * @param value 绑定的值
   */
  mounted(el, { value }) {
    // 设置初始值，确保在type="range"时在min/max之后设置
    el.value = value == null ? '' : value
  },
  /**
   * 指令更新前的钩子
   * @param el 元素
   * @param value 新值
   * @param oldValue 旧值
   * @param modifiers 修饰符
   * @param vnode 虚拟节点
   */
  beforeUpdate(
    el,
    { value, oldValue, modifiers: { lazy, trim, number } },
    vnode,
  ) {
    // 更新赋值函数
    el[assignKey] = getModelAssigner(vnode)
    // 避免清除未解析的文本。#2302
    if ((el as any).composing) return
    const elValue =
      (number || el.type === 'number') && !/^0\d/.test(el.value)
        ? looseToNumber(el.value)
        : el.value
    const newValue = value == null ? '' : value
    // 如果值没有变化，不进行更新
    if (elValue === newValue) {
      return
    }
    // 处理元素聚焦状态下的特殊情况
    if (document.activeElement === el && el.type !== 'range') {
      // #8546
      if (lazy && value === oldValue) {
        return
      }
      if (trim && el.value.trim() === newValue) {
        return
      }
    }
    // 更新元素值
    el.value = newValue
  },
}
 

/**
 * 复选框的v-model指令
 * @type {ModelDirective<HTMLInputElement>}
 */
export const vModelCheckbox: ModelDirective<HTMLInputElement> = {
  // #4096 数组复选框需要深度遍历
  deep: true,
  /**
   * 指令创建时的钩子
   * @param el 元素
   * @param _ 未使用的参数
   * @param vnode 虚拟节点
   */
  created(el, _, vnode) {
    // 存储赋值函数
    el[assignKey] = getModelAssigner(vnode)
    // 监听change事件
    addEventListener(el, 'change', () => {
      // 获取模型值、元素值和选中状态
      const modelValue = (el as any)._modelValue
      const elementValue = getValue(el)
      const checked = el.checked
      const assign = el[assignKey]
      // 处理数组类型的模型值
      if (isArray(modelValue)) {
        const index = looseIndexOf(modelValue, elementValue)
        const found = index !== -1
        // 选中且不在数组中，添加
        if (checked && !found) {
          assign(modelValue.concat(elementValue))
        } else if (!checked && found) {
          // 未选中但在数组中，移除
          const filtered = [...modelValue]
          filtered.splice(index, 1)
          assign(filtered)
        }
      } else if (isSet(modelValue)) {
        // 处理Set类型的模型值
        const cloned = new Set(modelValue)
        if (checked) {
          cloned.add(elementValue)
        } else {
          cloned.delete(elementValue)
        }
        assign(cloned)
      } else {
        // 处理普通类型的模型值
        assign(getCheckboxValue(el, checked))
      }
    })
  },
  // 在mounted时设置初始选中状态，以等待true-value/false-value
  mounted: setChecked,
  /**
   * 指令更新前的钩子
   * @param el 元素
   * @param binding 指令绑定
   * @param vnode 虚拟节点
   */
  beforeUpdate(el, binding, vnode) {
    // 更新赋值函数
    el[assignKey] = getModelAssigner(vnode)
    // 更新选中状态
    setChecked(el, binding, vnode)
  },
}

/**
 * 设置复选框的选中状态
 * @param el 复选框元素
 * @param value 绑定的值
 * @param oldValue 旧值
 * @param vnode 虚拟节点
 */
function setChecked(
  el: HTMLInputElement,
  { value, oldValue }: DirectiveBinding,
  vnode: VNode,
) {
  // 将v-model值存储在元素上，以便change监听器可以访问
  ;(el as any)._modelValue = value
  let checked: boolean

  // 处理数组类型的值
  if (isArray(value)) {
    checked = looseIndexOf(value, vnode.props!.value) > -1
  } else if (isSet(value)) {
    // 处理Set类型的值
    checked = value.has(vnode.props!.value)
  } else {
    // 处理普通类型的值
    if (value === oldValue) return
    checked = looseEqual(value, getCheckboxValue(el, true))
  }

  // 只有当选中状态发生变化时才更新
  if (el.checked !== checked) {
    el.checked = checked
  }
}

/**
 * 单选框的v-model指令
 * @type {ModelDirective<HTMLInputElement>}
 */
export const vModelRadio: ModelDirective<HTMLInputElement> = {
  created(el, { value }, vnode) {
    el.checked = looseEqual(value, vnode.props!.value)
    el[assignKey] = getModelAssigner(vnode)
    addEventListener(el, 'change', () => {
      el[assignKey](getValue(el))
    })
  },
  /**
   * 指令更新前的钩子
   * @param el 元素
   * @param value 新值
   * @param oldValue 旧值
   * @param vnode 虚拟节点
   */
  beforeUpdate(el, { value, oldValue }, vnode) {
    // 更新赋值函数
    el[assignKey] = getModelAssigner(vnode)
    // 只有当值发生变化时才更新选中状态
    if (value !== oldValue) {
      el.checked = looseEqual(value, vnode.props!.value)
    }
  },
}

  /**
 * 选择框的v-model指令
 * @type {ModelDirective<HTMLSelectElement, 'number'>}
 */
/**
 * 选择框的v-model指令
 * @type {ModelDirective<HTMLSelectElement, 'number'>}
 * @description 处理<select>元素的双向数据绑定，支持单选和多选模式
 */
export const vModelSelect: ModelDirective<HTMLSelectElement, 'number'> = {
  // <select multiple> value need to be deep traversed
  deep: true,
  created(el, { value, modifiers: { number } }, vnode) {
    const isSetModel = isSet(value)
    addEventListener(el, 'change', () => {
      const selectedVal = Array.prototype.filter
        .call(el.options, (o: HTMLOptionElement) => o.selected)
        .map((o: HTMLOptionElement) =>
          number ? looseToNumber(getValue(o)) : getValue(o),
        )
      el[assignKey](
        el.multiple
          ? isSetModel
            ? new Set(selectedVal)
            : selectedVal
          : selectedVal[0],
      )
      el._assigning = true
      nextTick(() => {
        el._assigning = false
      })
    })
    el[assignKey] = getModelAssigner(vnode)
  },
  // set value in mounted & updated because <select> relies on its children
  // <option>s.
  mounted(el, { value }) {
    setSelected(el, value)
  },
  beforeUpdate(el, _binding, vnode) {
    el[assignKey] = getModelAssigner(vnode)
  },
  updated(el, { value }) {
    if (!el._assigning) {
      setSelected(el, value)
    }
  },
}

/**
 * 设置选择框的选中状态
 * @param el 选择框元素
 * @param value 绑定的值
 * @description 根据绑定值更新<select>元素的选中状态，支持单选、多选和Set类型值
 */
function setSelected(el: HTMLSelectElement, value: any) {
  const isMultiple = el.multiple
  const isArrayValue = isArray(value)
  if (isMultiple && !isArrayValue && !isSet(value)) {
    __DEV__ &&
      warn(
        `<select multiple v-model> expects an Array or Set value for its binding, ` +
          `but got ${Object.prototype.toString.call(value).slice(8, -1)}.`,
      )
    return
  }

  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i]
    const optionValue = getValue(option)
    if (isMultiple) {
      if (isArrayValue) {
        const optionType = typeof optionValue
        // fast path for string / number values
        if (optionType === 'string' || optionType === 'number') {
          option.selected = value.some(v => String(v) === String(optionValue))
        } else {
          option.selected = looseIndexOf(value, optionValue) > -1
        }
      } else {
        option.selected = value.has(optionValue)
      }
    } else if (looseEqual(getValue(option), value)) {
      if (el.selectedIndex !== i) el.selectedIndex = i
      return
    }
  }
  if (!isMultiple && el.selectedIndex !== -1) {
    el.selectedIndex = -1
  }
}

// retrieve raw value set via :value bindings
/**
 * 获取表单元素的值
 * @param el 输入元素或选项元素
 * @returns 元素的值
 * @description 获取<input>或<option>元素的值，处理value属性和true-value/false-value特殊情况
 */
function getValue(el: HTMLOptionElement | HTMLInputElement) {
  return '_value' in el ? (el as any)._value : el.value
}

// retrieve raw value for true-value and false-value set via :true-value or :false-value bindings
/**
 * 获取复选框的值
 * @param el 复选框元素
 * @param checked 是否选中
 * @returns 复选框的值
 * @description 根据复选框的选中状态和true-value/false-value属性获取其值
 */
function getCheckboxValue(
  el: HTMLInputElement & { _trueValue?: any; _falseValue?: any },
  checked: boolean,
) {
  const key = checked ? '_trueValue' : '_falseValue'
  return key in el ? el[key] : checked
}

/**
 * 动态v-model指令
 * @type {ObjectDirective<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>}
 * @description 动态处理不同类型表单元素的v-model指令，根据元素类型和属性调用相应的模型钩子
 */
export const vModelDynamic: ObjectDirective<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
> = {
  created(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'created')
  },
  mounted(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'mounted')
  },
  beforeUpdate(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'beforeUpdate')
  },
  updated(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'updated')
  },
}

/**
 * 解析动态模型指令
 * @param tagName 标签名（大写）
 * @param type 输入类型
 * @returns 对应的模型指令对象
 * @description 根据元素标签名和类型解析并返回对应的v-model指令实现
 */
function resolveDynamicModel(tagName: string, type: string | undefined) {
  switch (tagName) {
    case 'SELECT':
      return vModelSelect
    case 'TEXTAREA':
      return vModelText
    default:
      switch (type) {
        case 'checkbox':
          return vModelCheckbox
        case 'radio':
          return vModelRadio
        default:
          return vModelText
      }
  }
}

/**
 * 调用模型指令的钩子函数
 * @param el 元素
 * @param binding 指令绑定对象
 * @param vnode 虚拟节点
 * @param prevVNode 上一个虚拟节点
 * @param hook 要调用的钩子名称
 * @description 根据元素类型和属性解析对应的v-model指令，并调用指定的钩子函数
 */
function callModelHook(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  binding: DirectiveBinding,
  vnode: VNode,
  prevVNode: VNode | null,
  hook: keyof ObjectDirective,
) {
  const modelToUse = resolveDynamicModel(
    el.tagName,
    vnode.props && vnode.props.type,
  )
  const fn = modelToUse[hook] as DirectiveHook
  fn && fn(el, binding, vnode, prevVNode)
}

/**
 * 为SSR初始化v-model指令
 * @description 在SSR环境中初始化v-model指令，为各种vModel指令设置getSSRProps方法，以便在服务端渲染时正确处理表单元素的值
 */
export function initVModelForSSR(): void {
  vModelText.getSSRProps = ({ value }) => ({ value })

  vModelRadio.getSSRProps = ({ value }, vnode) => {
    if (vnode.props && looseEqual(vnode.props.value, value)) {
      return { checked: true }
    }
  }

  vModelCheckbox.getSSRProps = ({ value }, vnode) => {
    if (isArray(value)) {
      if (vnode.props && looseIndexOf(value, vnode.props.value) > -1) {
        return { checked: true }
      }
    } else if (isSet(value)) {
      if (vnode.props && value.has(vnode.props.value)) {
        return { checked: true }
      }
    } else if (value) {
      return { checked: true }
    }
  }

  vModelDynamic.getSSRProps = (binding, vnode) => {
    if (typeof vnode.type !== 'string') {
      return
    }
    const modelToUse = resolveDynamicModel(
      // resolveDynamicModel expects an uppercase tag name, but vnode.type is lowercase
      vnode.type.toUpperCase(),
      vnode.props && vnode.props.type,
    )
    if (modelToUse.getSSRProps) {
      return modelToUse.getSSRProps(binding, vnode)
    }
  }
}

export type VModelDirective =
  | typeof vModelText
  | typeof vModelCheckbox
  | typeof vModelSelect
  | typeof vModelRadio
  | typeof vModelDynamic
