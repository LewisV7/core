/**
 * 创建一个映射并返回一个用于检查键是否在该映射中的函数
 * @description 此函数会将输入字符串按逗号分割成键列表，创建一个映射，然后返回一个检查函数
 * @important 所有对该函数的调用必须以 
 * \/\*#\_\_PURE\_\_\*\/
 * 这样rollup在必要时可以对它们进行tree-shake优化
 */

/*! #__NO_SIDE_EFFECTS__ */
/**
 * 创建一个映射并返回检查函数
 * @param {string} str - 包含逗号分隔键的字符串
 * @returns {(key: string) => boolean} 一个函数，接受一个键并返回该键是否在映射中
 * @example
 * const isAllowed = makeMap('a,b,c')
 * isAllowed('a') // true
 * isAllowed('d') // false
 */
export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null) // 创建一个没有原型的对象作为映射
  for (const key of str.split(',')) map[key] = 1 // 将字符串按逗号分割并填充映射
  return val => val in map // 返回检查函数
}
