/**
 * 用于生成组件实例唯一ID的工具函数
 * 包含生成ID和标记异步边界的功能
 */
import {
  type ComponentInternalInstance,
  getCurrentInstance,
} from '../component';
import { warn } from '../warning';

/**
 * 生成与当前组件实例关联的唯一ID
 * @returns 组件唯一ID字符串，如果没有活动组件实例则返回空字符串
 * @example
 * ```js
 * const id = useId() // 例如: 'v-1000'
 * ```
 */
export function useId(): string {
  // 获取当前组件实例
  const i = getCurrentInstance();

  if (i) {
    // 生成唯一ID: [前缀]-[实例ID][递增计数器]
    return (i.appContext.config.idPrefix || 'v') + '-' + i.ids[0] + i.ids[1]++;
  } else if (__DEV__) {
    // 开发环境下警告
    warn(
      `useId() 在没有活动组件实例可关联时被调用。`,
    );
  }

  return '';
}

/**
 * 标记异步边界并重置ID计数器
 * 异步边界包括以下三种类型:
 * - 异步组件
 * - 带有异步setup()的组件
 * - 带有serverPrefetch的组件
 * @param instance - 组件内部实例
 */
export function markAsyncBoundary(instance: ComponentInternalInstance): void {
  // 重置ID生成器，确保异步边界后的ID唯一性
  instance.ids = [instance.ids[0] + instance.ids[2]++ + '-', 0, 0];
}
