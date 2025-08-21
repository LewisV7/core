/**
 * 缓存工具函数
 * 提供基于环境的缓存实现选择
 * 在浏览器环境中使用Map，在其他环境中使用LRUCache
 */
import { LRUCache } from 'lru-cache'

/**
 * 创建缓存实例
 * @template T - 缓存值的类型
 * @param {number} [max=500] - 最大缓存项数（仅LRUCache有效）
 * @returns {Map<string, T> | LRUCache<string, T>} 根据环境返回的缓存实例
 */
export function createCache<T extends {}>(
  max = 500,
): Map<string, T> | LRUCache<string, T> {
  /* v8 ignore next 3 */
  // 在全局环境或ESM浏览器环境下使用Map
  if (__GLOBAL__ || __ESM_BROWSER__) {
    return new Map<string, T>()
  }
  // 在其他环境下使用LRUCache，限制最大缓存项数
  return new LRUCache({ max })
}
