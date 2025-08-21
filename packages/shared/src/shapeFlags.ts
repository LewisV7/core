/**
 * 形状标志用于标识虚拟DOM节点的类型和特性
 * 这些标志可以通过位运算符组合使用，以便在运行时快速判断节点类型
 */
export enum ShapeFlags {
  /**
   * 表示普通HTML元素节点
   */
  ELEMENT = 1,

  /**
   * 表示函数式组件
   */
  FUNCTIONAL_COMPONENT = 1 << 1,

  /**
   * 表示有状态组件
   */
  STATEFUL_COMPONENT = 1 << 2,

  /**
   * 表示子节点是文本内容
   */
  TEXT_CHILDREN = 1 << 3,

  /**
   * 表示子节点是数组
   */
  ARRAY_CHILDREN = 1 << 4,

  /**
   * 表示子节点是插槽内容
   */
  SLOTS_CHILDREN = 1 << 5,

  /**
   * 表示Teleport组件（ teleport 是Vue中的一个内置组件，用于将内容渲染到DOM中的其他位置）
   */
  TELEPORT = 1 << 6,

  /**
   * 表示Suspense组件（用于处理异步依赖的加载状态）
   */
  SUSPENSE = 1 << 7,

  /**
   * 表示组件应该被保持存活状态（用于keep-alive组件）
   */
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8,

  /**
   * 表示组件已经被保持存活状态（用于keep-alive组件）
   */
  COMPONENT_KEPT_ALIVE = 1 << 9,

  /**
   * 表示任意组件（组合了有状态组件和函数式组件的标志）
   */
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT,
}
