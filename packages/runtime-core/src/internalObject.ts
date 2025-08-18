/**
 * 用于在虚拟节点(vnode)的属性(props)/插槽(slots)规范化过程中，
 * 通过 `Object.getPrototypeOf` 检查vnode的props/slots是否是组件的内部attrs/slots对象。
 * 这种方式比定义一个不可枚举的属性更加高效。(这是为ssr-benchmark做的优化之一)
 */
/** 内部对象的原型，用于标识内部对象 */
const internalObjectProto = {}

/**
 * 创建一个内部对象
 * @returns 一个以internalObjectProto为原型的新对象
 */
export const createInternalObject = (): any =>
  Object.create(internalObjectProto)

/**
 * 检查一个对象是否是内部对象
 * @param obj 要检查的对象
 * @returns 如果对象是内部对象则返回true，否则返回false
 */
export const isInternalObject = (obj: object): boolean =>
  Object.getPrototypeOf(obj) === internalObjectProto
