/* eslint-disable no-restricted-globals */
/*
 * 热模块替换(HMR)功能实现
 * 此文件提供了Vue组件的热重载功能，允许在开发过程中修改组件
 * 而不需要完全重新加载应用程序。核心功能包括组件注册、重新渲染和重新加载。
 */
// 导入必要的类型和工具函数
import {
  type ClassComponent,
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  type InternalRenderFunction,
  isClassComponent,
} from './component'
import { queueJob, queuePostFlushCb } from './scheduler'
import { extend, getGlobalThis } from '@vue/shared'

/**
 * HMR组件类型
 * 可以是组件选项对象或类组件
 */
type HMRComponent = ComponentOptions | ClassComponent

/**
 * 标记当前是否正在进行HMR更新
 */
export let isHmrUpdating = false

/**
 * 存储需要进行HMR更新的组件实例
 * key: 组件定义, value: 需要更新的实例集合
 */
export const hmrDirtyComponents: Map<
  ConcreteComponent,
  Set<ComponentInternalInstance>
> = new Map<ConcreteComponent, Set<ComponentInternalInstance>>()

/**
 * HMR运行时接口
 * 定义了热模块替换所需的核心方法
 */
export interface HMRRuntime {
  createRecord: typeof createRecord
  rerender: typeof rerender
  reload: typeof reload
}

// 暴露HMR运行时到全局对象
// 这使得它完全可树摇且不会污染导出，并更容易被vue-loader等工具使用
// 注意：组件要支持HMR，还需要设置__hmrId选项以便实例可以被注册/移除
// This makes it entirely tree-shakable without polluting the exports and makes
// it easier to be used in toolings like vue-loader
// Note: for a component to be eligible for HMR it also needs the __hmrId option
// to be set so that its instances can be registered / removed.
if (__DEV__) {
  getGlobalThis().__VUE_HMR_RUNTIME__ = {
    createRecord: tryWrap(createRecord),
    rerender: tryWrap(rerender),
    reload: tryWrap(reload),
  } as HMRRuntime
}

/**
 * 存储组件HMR记录的映射
 * key: 组件ID, value: 包含初始定义和实例集合的对象
 */
const map: Map<
  string,
  {
    // the initial component definition is recorded on import - this allows us
    // to apply hot updates to the component even when there are no actively
    // rendered instance.
    initialDef: ComponentOptions
    instances: Set<ComponentInternalInstance>
  }
> = new Map()

/**
 * 注册组件实例以支持HMR
 * @param instance 组件内部实例
 */
export function registerHMR(instance: ComponentInternalInstance): void {
  const id = instance.type.__hmrId!
  let record = map.get(id)
  if (!record) {
    createRecord(id, instance.type as HMRComponent)
    record = map.get(id)!
  }
  record.instances.add(instance)
}

/**
 * 取消注册组件实例的HMR支持
 * @param instance 组件内部实例
 */
export function unregisterHMR(instance: ComponentInternalInstance): void {
  map.get(instance.type.__hmrId!)!.instances.delete(instance)
}

/**
 * 创建组件HMR记录
 * @param id 组件唯一ID
 * @param initialDef 组件初始定义
 * @returns 如果记录创建成功则返回true，否则返回false
 */
function createRecord(id: string, initialDef: HMRComponent): boolean {
  if (map.has(id)) {
    return false
  }
  map.set(id, {
    initialDef: normalizeClassComponent(initialDef),
    instances: new Set(),
  })
  return true
}

/**
 * 标准化类组件
 * 将类组件转换为组件选项对象
 * @param component 要标准化的组件
 * @returns 标准化后的组件选项对象
 */
function normalizeClassComponent(component: HMRComponent): ComponentOptions {
  return isClassComponent(component) ? component.__vccOpts : component
}

/**
 * 重新渲染组件
 * 更新组件的渲染函数并触发重新渲染
 * @param id 组件唯一ID
 * @param newRender 新的渲染函数
 */
function rerender(id: string, newRender?: Function): void {
  const record = map.get(id)
  if (!record) {
    return
  }

  // 更新初始记录(用于尚未渲染的组件)
  record.initialDef.render = newRender

  // 创建快照，避免在更新过程中修改集合
  ;[...record.instances].forEach(instance => {
    if (newRender) {
      instance.render = newRender as InternalRenderFunction
      normalizeClassComponent(instance.type as HMRComponent).render = newRender
    }
    instance.renderCache = []
    // 此标志强制具有插槽内容的子组件更新
    isHmrUpdating = true
    instance.update()
    isHmrUpdating = false
  })
}

/**
 * 重新加载组件
 * 完全替换组件定义并重新挂载组件
 * @param id 组件唯一ID
 * @param newComp 新的组件定义
 */
function reload(id: string, newComp: HMRComponent): void {
  const record = map.get(id)
  if (!record) return

  newComp = normalizeClassComponent(newComp)
  // 更新初始定义(用于尚未渲染的组件)
  updateComponentDef(record.initialDef, newComp)

  // 创建快照，避免在更新过程中修改集合
  const instances = [...record.instances]

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const oldComp = normalizeClassComponent(instance.type as HMRComponent)

    let dirtyInstances = hmrDirtyComponents.get(oldComp)
    if (!dirtyInstances) {
      // 1. 更新现有组件定义以匹配新定义
      if (oldComp !== record.initialDef) {
        updateComponentDef(oldComp, newComp)
      }
      // 2. 标记定义为脏。这会强制渲染器在patch时替换组件
      // component on patch.
      hmrDirtyComponents.set(oldComp, (dirtyInstances = new Set()))
    }
    dirtyInstances.add(instance)

    // 3. 清除选项解析缓存
    instance.appContext.propsCache.delete(instance.type as any)
    instance.appContext.emitsCache.delete(instance.type as any)
    instance.appContext.optionsCache.delete(instance.type as any)

    // 4. actually update
    if (instance.ceReload) {
      // 自定义元素
      dirtyInstances.add(instance)
      instance.ceReload((newComp as any).styles)
      dirtyInstances.delete(instance)
    } else if (instance.parent) {
      // 4. 强制父实例重新渲染。这将导致所有更新的组件被卸载并重新挂载
// 排队更新，以避免多次强制同一父组件重新渲染
      // components to be unmounted and re-mounted. Queue the update so that we
      // don't end up forcing the same parent to re-render multiple times.
      queueJob(() => {
        isHmrUpdating = true
        instance.parent!.update()
        isHmrUpdating = false
        // #6930, #11248 avoid infinite recursion
        dirtyInstances.delete(instance)
      })
    } else if (instance.appContext.reload) {
      // 通过createApp()挂载的根实例有reload方法
      instance.appContext.reload()
    } else if (typeof window !== 'undefined') {
      // 通过原始render()创建的树内部的根实例。强制刷新
      window.location.reload()
    } else {
      console.warn(
        '[HMR] Root or manually mounted instance modified. Full reload required.',
      )
    }

    // 更新自定义元素子样式
    if (instance.root.ce && instance !== instance.root) {
      instance.root.ce._removeChildStyle(oldComp)
    }
  }

  // 5. 确保在更新后清理脏的hmr组件
  queuePostFlushCb(() => {
    hmrDirtyComponents.clear()
  })
}

/**
 * 更新组件定义
 * 用新组件定义扩展旧组件定义
 * @param oldComp 旧组件定义
 * @param newComp 新组件定义
 */
function updateComponentDef(
  oldComp: ComponentOptions,
  newComp: ComponentOptions,
) {
  extend(oldComp, newComp)
  for (const key in oldComp) {
    if (key !== '__file' && !(key in newComp)) {
      delete oldComp[key]
    }
  }
}

/**
 * 包装函数以捕获错误
 * 防止HMR过程中的错误导致整个应用崩溃
 * @param fn 要包装的函数
 * @returns 包装后的函数
 */
function tryWrap(fn: (id: string, arg: any) => any): Function {
  return (id: string, arg: any) => {
    try {
      return fn(id, arg)
    } catch (e: any) {
      console.error(e)
      console.warn(
        `[HMR] Something went wrong during Vue component hot-reload. ` +
          `Full reload required.`,
      )
    }
  }
}
