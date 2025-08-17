/**
 * Vue编译器兼容性配置模块
 * 包含处理Vue 2和Vue 3之间编译器差异的配置和工具函数
 */
import type { SourceLocation } from '../ast'
import type { CompilerError } from '../errors'
import type { MergedParserOptions } from '../parser'
import type { TransformContext } from '../transform'

/**
 * 编译器兼容性配置
 * 用于控制如何处理已弃用的编译器特性
 */
export type CompilerCompatConfig = Partial<
  Record<CompilerDeprecationTypes, boolean | 'suppress-warning'>
> & {
  /**
   * 兼容模式
   * 2: 使用Vue 2的行为
   * 3: 使用Vue 3的行为
   */
  MODE?: 2 | 3
}

/**
 * 编译器兼容性选项
 */
export interface CompilerCompatOptions {
  /**
   * 兼容性配置对象
   */
  compatConfig?: CompilerCompatConfig
}

/**
 * 编译器弃用类型枚举
 * 标识各种在Vue 3中已弃用的Vue 2编译器特性
 */
export enum CompilerDeprecationTypes {
  /**
   * 元素上的is属性处理方式变更
   */
  COMPILER_IS_ON_ELEMENT = 'COMPILER_IS_ON_ELEMENT',
  /**
   * v-bind.sync修饰符已移除
   */
  COMPILER_V_BIND_SYNC = 'COMPILER_V_BIND_SYNC',
  /**
   * v-bind对象顺序敏感性变更
   */
  COMPILER_V_BIND_OBJECT_ORDER = 'COMPILER_V_BIND_OBJECT_ORDER',
  /**
   * v-on.native修饰符已移除
   */
  COMPILER_V_ON_NATIVE = 'COMPILER_V_ON_NATIVE',
  /**
   * v-if与v-for优先级变更
   */
  COMPILER_V_IF_V_FOR_PRECEDENCE = 'COMPILER_V_IF_V_FOR_PRECEDENCE',
  /**
   * 原生template标签处理方式变更
   */
  COMPILER_NATIVE_TEMPLATE = 'COMPILER_NATIVE_TEMPLATE',
  /**
   * inline-template已移除
   */
  COMPILER_INLINE_TEMPLATE = 'COMPILER_INLINE_TEMPLATE',
  /**
   * 过滤器已移除
   */
  COMPILER_FILTERS = 'COMPILER_FILTERS',
}

/**
 * 弃用信息数据结构
 */
type DeprecationData = {
  /**
   * 弃用消息或消息生成函数
   */
  message: string | ((...args: any[]) => string)
  /**
   * 相关文档链接
   */
  link?: string
}

/**
 * 弃用类型数据映射
 * 包含每种弃用类型的详细信息和消息
 */
const deprecationData: Record<CompilerDeprecationTypes, DeprecationData> = {
  [CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT]: {
    message:
      `带有"is"属性的平台原生元素在Vue 3中将不再被视为组件，` +
      `除非"is"值明确以"vue:"为前缀。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/custom-elements-interop.html`,
  },

  [CompilerDeprecationTypes.COMPILER_V_BIND_SYNC]: {
    message: key =>
      `v-bind的.sync修饰符已被移除。请改用带参数的v-model。` +
      `\`v-bind:${key}.sync\`应改为\`v-model:${key}\`。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/v-model.html`,
  },

  [CompilerDeprecationTypes.COMPILER_V_BIND_OBJECT_ORDER]: {
    message:
      `v-bind="obj"的用法现在对顺序敏感，其行为类似于JavaScript对象展开：` +
      `在发生冲突时，它将覆盖出现在v-bind之前的现有不可合并属性。` +
      `要保留2.x行为，请移动v-bind使其成为第一个属性。` +
      `如果有意使用此用法，也可以抑制此警告。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/v-bind.html`,
  },

  [CompilerDeprecationTypes.COMPILER_V_ON_NATIVE]: {
    message: `v-on的.native修饰符已被移除，因为它不再必要。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/v-on-native-modifier-removed.html`,
  },

  [CompilerDeprecationTypes.COMPILER_V_IF_V_FOR_PRECEDENCE]: {
    message:
      `在同一元素上使用v-if / v-for的优先级在Vue 3中已更改：` +
      `v-if现在具有更高的优先级，并且将不再能够访问v-for作用域变量。` +
      `最好通过<template>标签或使用过滤v-for数据源的计算属性来避免歧义。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/v-if-v-for.html`,
  },

  [CompilerDeprecationTypes.COMPILER_NATIVE_TEMPLATE]: {
    message:
      `没有特殊指令的<template>在Vue 3中将渲染为原生template元素，` +
      `而不是其内部内容。`,
  },

  [CompilerDeprecationTypes.COMPILER_INLINE_TEMPLATE]: {
    message: `"inline-template"在Vue 3中已被移除。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/inline-template-attribute.html`,
  },

  [CompilerDeprecationTypes.COMPILER_FILTERS]: {
    message:
      `过滤器在Vue 3中已被移除。` +
      `"|"符号将被视为原生JavaScript按位或运算符。` +
      `请改用方法调用或计算属性。`,
    link: `https://v3-migration.vuejs.org/breaking-changes/filters.html`,
  },
}

/**
 * 获取兼容性配置值
 * @param key 配置键，可以是弃用类型或'MODE'
 * @param context 解析器选项或转换上下文
 * @returns 配置值，如果未设置则返回默认值
 */
function getCompatValue(
  key: CompilerDeprecationTypes | 'MODE',
  { compatConfig }: MergedParserOptions | TransformContext,
) {
  const value = compatConfig && compatConfig[key]
  if (key === 'MODE') {
    return value || 3 // 编译器默认为v3行为
  } else {
    return value
  }
}

/**
 * 检查兼容性特性是否启用
 * @param key 兼容性特性键
 * @param context 解析器选项或转换上下文
 * @returns 如果特性启用则返回true，否则返回false
 */
export function isCompatEnabled(
  key: CompilerDeprecationTypes,
  context: MergedParserOptions | TransformContext,
): boolean {
  const mode = getCompatValue('MODE', context)
  const value = getCompatValue(key, context)
  // 在v3模式下，仅当显式设置为true时才启用
  // 否则，对于任何非false值都启用
  return mode === 3 ? value === true : value !== false
}

/**
 * 检查兼容性特性是否启用并发出警告
 * @param key 兼容性特性键
 * @param context 解析器选项或转换上下文
 * @param loc 源代码位置
 * @param args 传递给警告函数的额外参数
 * @returns 如果特性启用则返回true，否则返回false
 */
export function checkCompatEnabled(
  key: CompilerDeprecationTypes,
  context: MergedParserOptions | TransformContext,
  loc: SourceLocation | null,
  ...args: any[]
): boolean {
  const enabled = isCompatEnabled(key, context)
  if (__DEV__ && enabled) {
    warnDeprecation(key, context, loc, ...args)
  }
  return enabled
}

/**
 * 发出弃用警告
 * @param key 弃用类型键
 * @param context 解析器选项或转换上下文
 * @param loc 源代码位置
 * @param args 传递给消息函数的额外参数
 */
export function warnDeprecation(
  key: CompilerDeprecationTypes,
  context: MergedParserOptions | TransformContext,
  loc: SourceLocation | null,
  ...args: any[]
): void {
  const val = getCompatValue(key, context)
  if (val === 'suppress-warning') {
    return
  }
  const { message, link } = deprecationData[key]
  const msg = `(deprecation ${key}) ${
    typeof message === 'function' ? message(...args) : message
  }${link ? `\n  Details: ${link}` : ``}`

  const err = new SyntaxError(msg) as CompilerError
  err.code = key
  if (loc) err.loc = loc
  context.onWarn(err)
}
