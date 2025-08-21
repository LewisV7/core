/**
 * 编译器SFC脚本处理工具函数
 * 包含解析AST节点、处理导入语句、类型转换等辅助功能
 */
import type {
  CallExpression,
  Expression,
  Identifier,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  Node,
  StringLiteral,
} from '@babel/types'
import path from 'path'

/** 未知类型的字符串表示 */
export const UNKNOWN_TYPE = 'Unknown'

/**
 * 解析对象键名
 * @param node 要解析的AST节点
 * @param computed 是否为计算属性
 * @returns 解析后的键名字符串，无法解析时返回undefined
 */
export function resolveObjectKey(
  node: Node,
  computed: boolean,
): string | undefined {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
      return String(node.value)
    case 'Identifier':
      // 非计算属性直接返回标识符名称
      if (!computed) return node.name
  }
  return undefined
}

/**
 * 连接字符串数组，过滤掉假值
 * @param strs 字符串或假值的数组
 * @returns 连接后的字符串
 */
export function concatStrings(
  strs: Array<string | null | undefined | false>,
): string {
  return strs.filter((s): s is string => !!s).join(', ')
}

/**
 * 检查节点是否为字面量类型
 * @param node 要检查的AST节点
 * @returns 是否为字面量节点
 */
export function isLiteralNode(node: Node): boolean {
  return node.type.endsWith('Literal')
}

/**
 * 检查节点是否为特定函数调用
 * @param node 要检查的AST节点
 * @param test 函数名或判断函数名的函数
 * @returns 是否为目标函数调用
 */
export function isCallOf(
  node: Node | null | undefined,
  test: string | ((id: string) => boolean) | null | undefined,
): node is CallExpression {
  return !!(
    node &&
    test &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    (typeof test === 'string'
      ? node.callee.name === test
      : test(node.callee.name))
  )
}

/**
 * 将类型数组转换为运行时类型字符串
 * @param types 类型名称数组
 * @returns 格式化后的类型字符串
 */
export function toRuntimeTypeString(types: string[]): string {
  return types.length > 1 ? `[${types.join(', ')}]` : types[0]
}

/**
 * 获取导入的名称
 * @param specifier 导入说明符
 * @returns 导入的名称
 */
export function getImportedName(
  specifier:
    | ImportSpecifier
    | ImportDefaultSpecifier
    | ImportNamespaceSpecifier,
): string {
  if (specifier.type === 'ImportSpecifier')
    return specifier.imported.type === 'Identifier'
      ? specifier.imported.name
      : specifier.imported.value
  else if (specifier.type === 'ImportNamespaceSpecifier')
    // 命名空间导入返回 '*'
    return '*'
  // 默认导入返回 'default'
  return 'default'
}

/**
 * 获取标识符或字符串字面量的值
 * @param node 标识符或字符串字面量节点
 * @returns 节点的值
 */
export function getId(node: Identifier | StringLiteral): string
export function getId(node: Expression): string | null
export function getId(node: Expression) {
  return node.type === 'Identifier'
    ? node.name
    : node.type === 'StringLiteral'
      ? node.value
      : null
}

// 恒等函数
const identity = (str: string) => str
// 文件名小写正则表达式
const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\/:\-_\. ]+/g
// 转换为小写的函数
const toLowerCase = (str: string) => str.toLowerCase()

/**
 * 将文件名转换为小写（处理特殊字符）
 * @param x 文件名
 * @returns 转换后的小写文件名
 */
function toFileNameLowerCase(x: string) {
  return fileNameLowerCaseRegExp.test(x)
    ? x.replace(fileNameLowerCaseRegExp, toLowerCase)
    : x
}

/**
 * 创建规范化文件名的函数
 * 用于TypeScript模块解析缓存
 * @param useCaseSensitiveFileNames 是否区分文件名大小写
 * @returns 规范化文件名的函数
 */
export function createGetCanonicalFileName(
  useCaseSensitiveFileNames: boolean,
): (str: string) => string {
  return useCaseSensitiveFileNames ? identity : toFileNameLowerCase
}

// 在浏览器构建中，polyfill不暴露posix，但默认为posix行为
const normalize = (path.posix || path).normalize
const windowsSlashRE = /\\/g

/**
 * 标准化路径格式
 * 将Windows路径转换为Unix风格路径
 * @param p 要标准化的路径
 * @returns 标准化后的路径
 */
export function normalizePath(p: string): string {
  return normalize(p.replace(windowsSlashRE, '/'))
}

/**
 * 连接多个路径片段
 * @param paths 路径片段数组
 * @returns 连接后的路径
 */
export const joinPaths: (...paths: string[]) => string = (path.posix || path)
  .join

/**
 * 匹配属性名中需要转义的符号
 * 例如: onUpdate:modelValue -> "onUpdate:modelValue"
 */
export const propNameEscapeSymbolsRE: RegExp =
  /[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~\-]/

/**
 * 获取转义后的属性名
 * @param key 属性名
 * @returns 转义后的属性名
 */
export function getEscapedPropName(key: string): string {
  return propNameEscapeSymbolsRE.test(key) ? JSON.stringify(key) : key
}
