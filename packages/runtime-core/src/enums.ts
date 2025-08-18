/**
 * Vue 组件生命周期钩子枚举
 * 定义了组件从创建到销毁的整个生命周期中的各个阶段
 */
export enum LifecycleHooks {
  /**
   * 实例创建前
   * 在组件实例初始化之前调用
   */
  BEFORE_CREATE = 'bc',

  /**
   * 实例创建完成
   * 组件实例已完成初始化，但尚未挂载到DOM
   */
  CREATED = 'c',

  /**
   * 挂载前
   * 在组件挂载到DOM之前调用
   */
  BEFORE_MOUNT = 'bm',

  /**
   * 挂载完成
   * 组件已成功挂载到DOM
   */
  MOUNTED = 'm',

  /**
   * 更新前
   * 组件数据更新，DOM即将重新渲染前调用
   */
  BEFORE_UPDATE = 'bu',

  /**
   * 更新完成
   * 组件数据更新且DOM已重新渲染后调用
   */
  UPDATED = 'u',

  /**
   * 卸载前
   * 组件即将从DOM中卸载前调用
   */
  BEFORE_UNMOUNT = 'bum',

  /**
   * 卸载完成
   * 组件已从DOM中卸载后调用
   */
  UNMOUNTED = 'um',

  /**
   * 停用
   *  KeepAlive组件停用时调用
   */
  DEACTIVATED = 'da',

  /**
   * 激活
   *  KeepAlive组件激活时调用
   */
  ACTIVATED = 'a',

  /**
   * 渲染触发
   * 调试钩子，当组件渲染被触发时调用
   */
  RENDER_TRIGGERED = 'rtg',

  /**
   * 渲染追踪
   * 调试钩子，当组件依赖被追踪时调用
   */
  RENDER_TRACKED = 'rtc',

  /**
   * 错误捕获
   * 捕获子组件错误时调用
   */
  ERROR_CAPTURED = 'ec',

  /**
   * 服务端预取
   * 服务端渲染时预取数据的钩子
   */
  SERVER_PREFETCH = 'sp',
}
