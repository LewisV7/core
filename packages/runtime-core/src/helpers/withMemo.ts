/**
 * 记忆化渲染结果的工具函数
 * 用于根据依赖项的变化决定是否重新渲染组件
 */
import { hasChanged } from '@vue/shared';
import { type VNode, currentBlock, isBlockTreeEnabled } from '../vnode';

/**
 * 基于依赖项数组记忆化渲染结果
 * @param memo - 依赖项数组，当这些值变化时会触发重新渲染
 * @param render - 渲染函数，返回一个VNode
 * @param cache - 缓存数组，用于存储已渲染的VNode
 * @param index - 当前组件在缓存数组中的索引
 * @returns 渲染后的VNode，可能是缓存的或新创建的
 */
export function withMemo(
  memo: any[],
  render: () => VNode<any, any>,
  cache: any[],
  index: number
): VNode<any, any> {
  // 尝试从缓存中获取VNode
  const cached = cache[index] as VNode | undefined;

  // 如果缓存存在且依赖项没有变化，则返回缓存的VNode
  if (cached && isMemoSame(cached, memo)) {
    return cached;
  }

  // 否则执行渲染函数获取新的VNode
  const ret = render();

  // 浅拷贝依赖项数组，用于下次比较
  ret.memo = memo.slice();
  // 记录缓存索引
  ret.cacheIndex = index;

  // 更新缓存并返回新的VNode
  return (cache[index] = ret);
}

/**
 * 检查缓存的VNode依赖项是否与新的依赖项相同
 * @param cached - 缓存的VNode
 * @param memo - 新的依赖项数组
 * @returns 如果依赖项相同则返回true，否则返回false
 */
export function isMemoSame(cached: VNode, memo: any[]): boolean {
  const prev: any[] = cached.memo!;

  // 检查依赖项数组长度是否变化
  if (prev.length !== memo.length) {
    return false;
  }

  // 逐个比较依赖项是否变化
  for (let i = 0; i < prev.length; i++) {
    if (hasChanged(prev[i], memo[i])) {
      return false;
    }
  }

  // 确保在返回缓存的VNode时，让父区块跟踪它
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(cached);
  }

  return true;
}
