/**
 * 警告工具函数
 * 提供一次性警告和格式化警告功能
 */

/**
 * 用于记录已经发出过的警告信息
 * @type {Record<string, boolean>}
 */
const hasWarned: Record<string, boolean> = {}

/**
 * 确保同一个警告信息只被显示一次
 * @param {string} msg - 警告信息
 */
export function warnOnce(msg: string): void {
  const isNodeProd =
    typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
  if (!isNodeProd && !__TEST__ && !hasWarned[msg]) {
    hasWarned[msg] = true
    warn(msg)
  }
}

/**
 * 显示带有格式化的警告信息
 * @param {string} msg - 警告信息
 */
export function warn(msg: string): void {
  console.warn(
    `\x1b[1m\x1b[33m[@vue/compiler-sfc]\x1b[0m\x1b[33m ${msg}\x1b[0m\n`,
  )
}
