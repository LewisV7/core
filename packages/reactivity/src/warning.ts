/**
 * Vue 响应式系统中的警告工具函数
 * 用于打印带有 [Vue warn] 前缀的警告信息
 */

/**
 * 打印Vue警告信息
 * 
 * @param msg - 警告消息内容
 * @param args - 额外的参数，会被传递给console.warn
 */
export function warn(msg: string, ...args: any[]): void {
  console.warn(`[Vue warn] ${msg}`, ...args)
}
