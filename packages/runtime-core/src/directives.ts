/**
 * Vue 3 核心模块 - 指令系统
 * 提供运行时应用指令到虚拟节点的功能，包括指令的定义、绑定和钩子调用
 *
 * 使用示例:
 * const comp = resolveComponent('comp')
 * const foo = resolveDirective('foo')
 * const bar = resolveDirective('bar')
 *
 * return withDirectives(h(comp), [
 *   [foo, this.x],
 *   [bar, this.y]
 * ])
 */

import type { VNode } from './vnode'
import { EMPTY_OBJ, isBuiltInDirective, isFunction } from '@vue/shared'
import { warn } from './warning'
import {
  type ComponentInternalInstance,
  type Data,
  getComponentPublicInstance,
} from './component'
import { currentRenderingInstance } from './componentRenderContext'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { mapCompatDirectiveHook } from './compat/customDirective'
import { pauseTracking, resetTracking, traverse } from '@vue/reactivity'

/**
 * 指令绑定对象接口
 * @template Value - 指令的值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 */
export interface DirectiveBinding<
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> {
  /** 组件的公共实例 */
  instance: ComponentPublicInstance | Record<string, any> | null
  /** 指令的值 */
  value: Value
  /** 指令的旧值 */
  oldValue: Value | null
  /** 指令的参数 */
  arg?: Arg
  /** 指令的修饰符 */
  modifiers: DirectiveModifiers<Modifiers>
  /** 指令对象 */
  dir: ObjectDirective<any, Value>
}

/**
 * 指令钩子函数类型
 * @template HostElement - 宿主元素类型
 * @template Prev - 前一个VNode类型
 * @template Value - 指令值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 * @param el - 绑定指令的元素
 * @param binding - 指令绑定对象
 * @param vnode - 当前虚拟节点
 * @param prevVNode - 前一个虚拟节点
 */
export type DirectiveHook<
  HostElement = any,
  Prev = VNode<any, HostElement> | null,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = (
  el: HostElement,
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode<any, HostElement>,
  prevVNode: Prev,
) => void

/**
 * SSR环境下的指令钩子函数类型
 * @template Value - 指令值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 * @param binding - 指令绑定对象
 * @param vnode - 虚拟节点
 * @returns 服务器渲染的属性数据
 */
export type SSRDirectiveHook<
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = (
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode,
) => Data | undefined

/**
 * 对象形式的指令接口
 * @template HostElement - 宿主元素类型
 * @template Value - 指令值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 */
export interface ObjectDirective<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> {
  /**
   * @internal 内部使用，解决TS类型检查问题
   */
  __mod?: Modifiers
  /** 指令创建时调用 */
  created?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  /** 指令挂载前调用 */
  beforeMount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  /** 指令挂载后调用 */
  mounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  /** 指令更新前调用 */
  beforeUpdate?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  /** 指令更新后调用 */
  updated?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  /** 指令卸载前调用 */
  beforeUnmount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  /** 指令卸载后调用 */
  unmounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  /** SSR环境下获取属性的钩子 */
  getSSRProps?: SSRDirectiveHook<Value, Modifiers, Arg>
  /** 是否深度监听值变化 */
  deep?: boolean
}

/**
 * 函数形式的指令类型
 * @template HostElement - 宿主元素类型
 * @template V - 指令值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 */
export type FunctionDirective<
  HostElement = any,
  V = any,
  Modifiers extends string = string,
  Arg extends string = string,
> = DirectiveHook<HostElement, any, V, Modifiers, Arg>

/**
 * 指令类型，可以是对象形式或函数形式
 * @template HostElement - 宿主元素类型
 * @template Value - 指令值类型
 * @template Modifiers - 指令修饰符类型
 * @template Arg - 指令参数类型
 */
export type Directive<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg extends string = string,
> =
  | ObjectDirective<HostElement, Value, Modifiers, Arg>
  | FunctionDirective<HostElement, Value, Modifiers, Arg>

/**
 * 指令修饰符类型
 * @template K - 修饰符名称类型
 */
export type DirectiveModifiers<K extends string = string> = Partial<
  Record<K, boolean>
>

/**
 * 验证指令名称是否合法
 * @param name - 指令名称
 */
export function validateDirectiveName(name: string): void {
  // 检查是否是内置指令
  if (isBuiltInDirective(name)) {
    warn('不要使用内置指令ID作为自定义指令ID: ' + name)
  }
}

/**
 * 指令参数数组类型
 * 格式: [指令, 值, 参数, 修饰符]
 */
export type DirectiveArguments = Array<
  | [Directive | undefined]
  | [Directive | undefined, any]
  | [Directive | undefined, any, string]
  | [Directive | undefined, any, string | undefined, DirectiveModifiers]
>

/**
 * 为虚拟节点添加指令
 * @template T - 虚拟节点类型
 * @param vnode - 要添加指令的虚拟节点
 * @param directives - 指令参数数组
 * @returns 添加了指令的虚拟节点
 */
export function withDirectives<T extends VNode>(
  vnode: T,
  directives: DirectiveArguments,
): T {
  // 检查是否在渲染函数中调用
  if (currentRenderingInstance === null) {
    __DEV__ && warn(`withDirectives只能在渲染函数内部使用。`)
    return vnode
  }
  // 获取组件公共实例
  const instance = getComponentPublicInstance(currentRenderingInstance)
  // 获取或初始化指令绑定数组
  const bindings: DirectiveBinding[] = vnode.dirs || (vnode.dirs = [])
  // 遍历所有指令
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i]
    if (dir) {
      // 如果是函数形式的指令，转换为对象形式
      if (isFunction(dir)) {
        dir = {
          mounted: dir,
          updated: dir,
        } as ObjectDirective
      }
      // 如果指令设置了deep，深度遍历值
      if (dir.deep) {
        traverse(value)
      }
      // 添加指令绑定
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers,
      })
    }
  }
  return vnode
}

/**
 * 调用指令钩子函数
 * @param vnode - 当前虚拟节点
 * @param prevVNode - 前一个虚拟节点
 * @param instance - 组件内部实例
 * @param name - 钩子名称
 */
export function invokeDirectiveHook(
  vnode: VNode,
  prevVNode: VNode | null,
  instance: ComponentInternalInstance | null,
  name: keyof ObjectDirective,
): void {
  // 获取当前节点的指令绑定
  const bindings = vnode.dirs!
  // 获取前一个节点的指令绑定
  const oldBindings = prevVNode && prevVNode.dirs!
  // 遍历所有指令绑定
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    // 如果有前一个节点的绑定，设置旧值
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value
    }
    // 获取对应的钩子函数
    let hook = binding.dir[name] as DirectiveHook | DirectiveHook[] | undefined
    // 兼容处理
    if (__COMPAT__ && !hook) {
      hook = mapCompatDirectiveHook(name, binding.dir, instance)
    }
    // 如果钩子存在
    if (hook) {
      // 暂停依赖跟踪，因为钩子可能在effect中调用
      pauseTracking()
      // 调用钩子并处理错误
      callWithAsyncErrorHandling(hook, instance, ErrorCodes.DIRECTIVE_HOOK, [
        vnode.el,
        binding,
        vnode,
        prevVNode,
      ])
      // 重置依赖跟踪
      resetTracking()
    }
  }
}
