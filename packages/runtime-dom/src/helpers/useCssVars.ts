// 导入Vue运行时核心模块中的类型和工具函数
import {
  Fragment,
  Static,
  type VNode,
  getCurrentInstance,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  queuePostFlushCb,
  warn,
  watch,
} from '@vue/runtime-core'
// 导入Vue共享模块中的工具函数
import { NOOP, ShapeFlags, normalizeCssVarValue } from '@vue/shared'

/**
 * 存储CSS变量文本的符号
 * @type {unique symbol}
 * @description 用于在元素style对象上存储CSS变量文本内容
 */
export const CSS_VAR_TEXT: unique symbol = Symbol(__DEV__ ? 'CSS_VAR_TEXT' : '')
/**
 * 单文件组件CSS变量注入功能的运行时辅助函数
 * @param {Function} getter - 获取CSS变量的函数，接收组件实例代理对象作为参数
 * @returns {void} 无返回值
 * @description 用于在运行时将CSS变量注入到组件中，并在变量变化时更新
 * @private
 */
export function useCssVars(
  getter: (ctx: any) => Record<string, unknown>,
): void {
  if (!__BROWSER__ && !__TEST__) return

  // 获取当前组件实例
  const instance = getCurrentInstance()
  /* v8 ignore start */
  if (!instance) {
    __DEV__ &&
      warn(`useCssVars is called without current active component instance.`)
    return
  }
  /* v8 ignore stop */

  // 定义更新Teleport元素的函数
  // 将函数存储在实例的ut属性上，便于外部调用
  const updateTeleports = (instance.ut = (vars = getter(instance.proxy)) => {
    Array.from(
      document.querySelectorAll(`[data-v-owner="${instance.uid}"]`),
    ).forEach(node => setVarsOnNode(node, vars))
  })

  // 开发环境下，为实例添加获取CSS变量的方法
  if (__DEV__) {
    instance.getCssVars = () => getter(instance.proxy)
  }

  // 定义设置CSS变量的核心函数
  const setVars = () => {
    // 获取CSS变量值
    const vars = getter(instance.proxy)
    // 根据组件实例情况设置CSS变量
    if (instance.ce) {
      // 如果有ce(container element)属性，则直接设置到该元素
      setVarsOnNode(instance.ce as any, vars)
    } else {
      // 否则遍历虚拟DOM树设置变量
      setVarsOnVNode(instance.subTree, vars)
    }
    // 更新Teleport元素的CSS变量
    updateTeleports(vars)
  }

  // 组件更新前钩子
  // 处理子组件根节点受影响的情况，并在onMounted中触发回流
  onBeforeUpdate(() => {
    // 将setVars函数放入后刷新队列，确保DOM更新后执行
    queuePostFlushCb(setVars)
  })

  // 组件挂载后钩子
  onMounted(() => {
    // 这里同步运行setVars，但在变化时作为后效运行
    // 监听setVars函数，当变量变化时执行NOOP（无操作），但会触发setVars
    watch(setVars, NOOP, { flush: 'post' })
    // 创建一个MutationObserver来观察DOM变化
    const ob = new MutationObserver(setVars)
    // 观察子树元素的父节点的子节点变化
    ob.observe(instance.subTree.el!.parentNode, { childList: true })
    // 组件卸载时断开观察器连接
    onUnmounted(() => ob.disconnect())
  })
}

/**
 * 将CSS变量应用到虚拟节点及其子节点
 * @param {VNode} vnode - 要应用CSS变量的虚拟节点
 * @param {Record<string, unknown>} vars - CSS变量键值对
 * @returns {void} 无返回值
 * @description 递归遍历虚拟DOM树，将CSS变量应用到所有元素节点
 */
function setVarsOnVNode(vnode: VNode, vars: Record<string, unknown>) {
  // 处理SUSPENSE特性
  if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
    const suspense = vnode.suspense!
    // 获取当前激活的分支
    vnode = suspense.activeBranch!
    // 如果有挂起的分支且不是水合过程
    if (suspense.pendingBranch && !suspense.isHydrating) {
      // 向suspense的效果队列中添加一个函数，当激活分支变化时执行
      suspense.effects.push(() => {
        setVarsOnVNode(suspense.activeBranch!, vars)
      })
    }
  }

  // 向下钻取高阶组件，直到找到非组件虚拟节点
  while (vnode.component) {
    vnode = vnode.component.subTree
  }

  // 根据虚拟节点类型进行处理
  if (vnode.shapeFlag & ShapeFlags.ELEMENT && vnode.el) {
    // 如果是元素节点，则设置到对应的DOM节点
    setVarsOnNode(vnode.el as Node, vars)
  } else if (vnode.type === Fragment) {
    // 如果是片段节点，则遍历其子节点
    ;(vnode.children as VNode[]).forEach(c => setVarsOnVNode(c, vars))
  } else if (vnode.type === Static) {
    // 如果是静态节点，则不处理（静态节点不会变化）
    let { el, anchor } = vnode
    while (el) {
      setVarsOnNode(el as Node, vars)
      if (el === anchor) break
      el = el.nextSibling
    }
  }
}

/**
 * 将CSS变量应用到DOM节点
 * @param {Node} el - 要应用CSS变量的DOM节点
 * @param {Record<string, unknown>} vars - CSS变量键值对
 * @returns {void} 无返回值
 * @description 将CSS变量设置到DOM节点的style属性上，并存储CSS文本内容
 */
function setVarsOnNode(el: Node, vars: Record<string, unknown>) {
  // 检查节点类型是否为元素节点
  if (el.nodeType === 1) {
    const style = (el as HTMLElement).style
    // 存储CSS变量文本内容
    let cssText = ''
    // 遍历所有CSS变量
    for (const key in vars) {
      // 标准化CSS变量值
      const value = normalizeCssVarValue(vars[key])
      // 设置CSS变量到元素样式
      style.setProperty(`--${key}`, value)
      // 构建CSS文本
      cssText += `--${key}: ${value};`
    }
    // 存储CSS变量文本到元素样式对象的特殊属性中
    ;(style as any)[CSS_VAR_TEXT] = cssText
  }
}
