/**
 * 插槽标志用于标识插槽的类型和特性
 * 这些标志帮助Vue运行时确定如何处理插槽更新
 */
export enum SlotFlags {
  /**
   * 稳定的插槽，只引用插槽props或上下文状态
   * 这种插槽可以完全捕获自己的依赖关系，因此当传递给子组件时，父组件不需要强制子组件更新
   */
  STABLE = 1,

  /**
   * 动态插槽，引用作用域变量（v-for或外部插槽prop）或具有条件结构（v-if、v-for）
   * 父组件需要强制子组件更新，因为这种插槽不能完全捕获其依赖关系
   */
  DYNAMIC = 2,

  /**
   * 被转发到子组件的`<slot/>`
   * 父组件是否需要更新子组件取决于父组件自身接收的插槽类型
   * 这必须在运行时（当子组件的vnode被创建时，在`normalizeChildren`函数中）进行细化
   */
  FORWARDED = 3,
}

/**
 * 仅开发环境使用
 * 将插槽标志映射到可读字符串，用于开发工具和调试信息
 */
export const slotFlagsText: Record<SlotFlags, string> = {
  [SlotFlags.STABLE]: 'STABLE', // 稳定插槽
  [SlotFlags.DYNAMIC]: 'DYNAMIC', // 动态插槽
  [SlotFlags.FORWARDED]: 'FORWARDED', // 转发插槽
}
