/**
 * Vue 3 核心模块 - 警告处理
 * 提供组件渲染过程中的警告输出和调试信息
 */
import type { VNode } from './vnode'
import {
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  formatComponentName,
} from './component'
import { isFunction, isString } from '@vue/shared'
import { isRef, pauseTracking, resetTracking, toRaw } from '@vue/reactivity'
import { ErrorCodes, callWithErrorHandling } from './errorHandling'

/**
 * 组件VNode类型
 * 扩展自VNode，具有具体组件类型
 */
type ComponentVNode = VNode & {
  type: ConcreteComponent
}

/**
 * 组件VNode调用栈
 * 用于跟踪当前组件渲染上下文
 */
const stack: VNode[] = []

/**
 * 跟踪条目类型
 * 包含组件VNode和递归计数
 */
type TraceEntry = {
  vnode: ComponentVNode
  recurseCount: number
}

type ComponentTraceStack = TraceEntry[]

/**
 * 推入警告上下文
 * @param vnode 当前VNode
 */
export function pushWarningContext(vnode: VNode): void {
  stack.push(vnode)
}

/**
 * 弹出警告上下文
 */
export function popWarningContext(): void {
  stack.pop()
}

let isWarning = false

/**
 * 输出警告信息
 * @param msg 警告消息
 * @param args 附加参数
 */
export function warn(msg: string, ...args: any[]): void {
  // 防止嵌套警告
  if (isWarning) return
  isWarning = true

  // 避免在格式化属性或警告处理器中跟踪可能在patch过程中被修改的依赖
  // 防止无限递归
  pauseTracking()

  // 获取当前组件实例
  const instance = stack.length ? stack[stack.length - 1].component : null
  // 获取应用的警告处理器
  const appWarnHandler = instance && instance.appContext.config.warnHandler
  // 获取组件调用栈跟踪
  const trace = getComponentTrace()

  if (appWarnHandler) {
    // 使用错误处理机制调用应用警告处理器
    callWithErrorHandling(
      appWarnHandler,
      instance,
      ErrorCodes.APP_WARN_HANDLER,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map(a => a.toString?.() ?? JSON.stringify(a)).join(''),
        instance && instance.proxy,
        trace
          .map(
            ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`,
          )
          .join('\n'),
        trace,
      ],
    )
  } // 其他类型
  else {
    // 构建警告参数
    const warnArgs = [`[Vue warn]: ${msg}`, ...args]
    if (
      trace.length &&
      // avoid spamming console during tests
      !__TEST__
    ) {
      /* v8 ignore next 2 */
      warnArgs.push(`\n`, ...formatTrace(trace))
    }
    console.warn(...warnArgs)
  }

  // 重置依赖跟踪
  resetTracking()
  isWarning = false
}

/**
 * 获取组件调用栈跟踪
 * @returns 组件跟踪栈
 */
export function getComponentTrace(): ComponentTraceStack {
  let currentVNode: VNode | null = stack[stack.length - 1]
  if (!currentVNode) {
    return []
  }

  // 不能直接使用stack，因为在非根组件更新时可能不完整
  // 使用实例的父指针重建父链
  const normalizedStack: ComponentTraceStack = []

  // 遍历构建组件调用栈
  while (currentVNode) {
    // 获取最后一个跟踪条目
    const last = normalizedStack[0]
    // 如果当前VNode已经在栈中，增加递归计数
    if (last && last.vnode === currentVNode) {
      // 增加递归计数
      last.recurseCount++
    } else {
      // 将当前VNode添加到跟踪栈
      normalizedStack.push({
        vnode: currentVNode as ComponentVNode,
        recurseCount: 0,
      })
    }
    const parentInstance: ComponentInternalInstance | null =
      currentVNode.component && currentVNode.component.parent
    currentVNode = parentInstance && parentInstance.vnode
  }

  return normalizedStack
}

/* v8 ignore start */
/**
 * 格式化跟踪信息
 * @param trace 组件跟踪栈
 * @returns 格式化后的日志信息
 */
function formatTrace(trace: ComponentTraceStack): any[] {
  // 初始化日志数组
  const logs: any[] = []
  // 遍历跟踪栈
  trace.forEach((entry, i) => {
    // 格式化每个跟踪条目并添加到日志
    logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry))
  })
  return logs
}

/**
 * 格式化跟踪条目
 * @param vnode 组件VNode
 * @param recurseCount 递归计数
 * @returns 格式化后的跟踪条目信息
 */
function formatTraceEntry({ vnode, recurseCount }: TraceEntry): any[] {
  // 计算递归调用后缀
  const postfix =
    recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``
  // 判断是否为根组件
  const isRoot = vnode.component ? vnode.component.parent == null : false
  // 构建组件名称开头
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot,
  )}`
  // 构建组件名称结尾
  const close = `>` + postfix
  // 返回格式化的跟踪条目
  return vnode.props
    ? [open, ...formatProps(vnode.props), close]
    : [open + close]
}

/**
 * 格式化组件属性
 * @param props 组件属性
 * @returns 格式化后的属性信息
 */
function formatProps(props: Data): any[] {
  // 初始化结果数组
  const res: any[] = []
  // 获取所有属性键
  const keys = Object.keys(props)
  // 最多处理3个属性
  keys.slice(0, 3).forEach(key => {
    // 格式化每个属性
    res.push(...formatProp(key, props[key]))
  })
  // 如果属性数量超过3个，添加省略提示
  if (keys.length > 3) {
    // 添加省略提示
    res.push(` ...`)
  }
  return res
}

/**
 * 格式化单个属性
 * @param key 属性名
 * @param value 属性值
 * @param raw 是否返回原始值
 * @returns 格式化后的属性信息
 */
function formatProp(key: string, value: unknown): any[]
function formatProp(key: string, value: unknown, raw: true): any
function formatProp(key: string, value: unknown, raw?: boolean): any {
  // 如果值是字符串
  if (isString(value)) {
    // 序列化字符串值
    value = JSON.stringify(value)
    // 根据raw参数决定返回格式
    return raw ? value : [`${key}=${value}`]
  } // 如果值是数字、布尔值或null/undefined
  else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value == null
  ) {
    return raw ? value : [`${key}=${value}`]
  } // 如果值是Ref引用
  else if (isRef(value)) {
    // 递归格式化Ref的值
    value = formatProp(key, toRaw(value.value), true)
    // 返回Ref格式
    return raw ? value : [`${key}=Ref<`, value, `>`]
  } // 如果值是函数
  else if (isFunction(value)) {
    // 返回函数格式
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`]
  } else {
    // 获取原始值
    value = toRaw(value)
    return raw ? value : [`${key}=`, value]
  }
}

/**
 * @internal
 */
/**
 * 断言值为数字
 * @param val 要检查的值
 * @param type 类型名称
 * @internal
 */
export function assertNumber(val: unknown, type: string): void {
  if (!__DEV__) return
  // 如果值未定义，则直接返回
  if (val === undefined) {
    return
  } // 如果值不是数字类型
  else if (typeof val !== 'number') {
    warn(`${type} is not a valid number - ` + `got ${JSON.stringify(val)}.`)
  } // 如果值是NaN
  else if (isNaN(val)) {
    warn(`${type} is NaN - ` + 'the duration expression might be incorrect.')
  }
}
/* v8 ignore stop */
