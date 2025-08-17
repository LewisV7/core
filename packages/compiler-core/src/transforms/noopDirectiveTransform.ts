import type { DirectiveTransform } from '../transform'

/**
 * 空操作指令转换器
 * 不执行任何实际的转换操作，返回一个包含空props数组的对象
 * @returns 包含空props数组的对象
 */
export const noopDirectiveTransform: DirectiveTransform = () => ({ props: [] })
