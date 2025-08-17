/**
 * Vue 编译器错误处理模块
 * 定义了编译器相关的错误类型、错误代码和错误处理函数
 */
import type { SourceLocation } from './ast'

/**
 * 编译器错误接口
 * @interface CompilerError
 * @extends {SyntaxError}
 * @property {number | string} code - 错误代码
 * @property {SourceLocation} [loc] - 错误位置信息
 */
export interface CompilerError extends SyntaxError {
  code: number | string
  loc?: SourceLocation
}

/**
 * 核心编译器错误接口
 * @interface CoreCompilerError
 * @extends {CompilerError}
 * @property {ErrorCodes} code - 错误代码（限定为ErrorCodes类型）
 */
export interface CoreCompilerError extends CompilerError {
  code: ErrorCodes
}

/**
 * 默认错误处理函数
 * @param {CompilerError} error - 编译器错误
 * @returns {never} 永远不会返回
 */
export function defaultOnError(error: CompilerError): never {
  throw error
}

/**
 * 默认警告处理函数
 * @param {CompilerError} msg - 警告信息
 * @returns {void} 无返回值
 */
export function defaultOnWarn(msg: CompilerError): void {
  __DEV__ && console.warn(`[Vue warn] ${msg.message}`)
}

/**
 * 根据错误代码类型推断错误接口类型
 * @template T
 * @typedef {T extends ErrorCodes ? CoreCompilerError : CompilerError} InferCompilerError
 */
type InferCompilerError<T> = T extends ErrorCodes
  ? CoreCompilerError
  : CompilerError

/**
 * 创建编译器错误
 * @template T
 * @param {T} code - 错误代码
 * @param {SourceLocation} [loc] - 错误位置信息
 * @param {{ [code: number]: string }} [messages] - 错误消息映射
 * @param {string} [additionalMessage] - 附加错误信息
 * @returns {InferCompilerError<T>} 创建的错误对象
 */
export function createCompilerError<T extends number>(
  code: T,
  loc?: SourceLocation,
  messages?: { [code: number]: string },
  additionalMessage?: string,
): InferCompilerError<T> {
  const msg =
    __DEV__ || !__BROWSER__
      ? (messages || errorMessages)[code] + (additionalMessage || ``)
      : `https://vuejs.org/error-reference/#compiler-${code}`
  const error = new SyntaxError(String(msg)) as InferCompilerError<T>
  error.code = code
  error.loc = loc
  return error
}

/**
 * 编译器错误代码枚举
 * @enum {number}
 */
export enum ErrorCodes {
  // 解析错误
  // 这些错误与HTML解析相关
  ABRUPT_CLOSING_OF_EMPTY_COMMENT, // 空注释的突然关闭
  CDATA_IN_HTML_CONTENT, // HTML内容中出现CDATA
  DUPLICATE_ATTRIBUTE, // 重复的属性
  END_TAG_WITH_ATTRIBUTES, // 结束标签带有属性
  END_TAG_WITH_TRAILING_SOLIDUS, // 结束标签带有斜杠
  EOF_BEFORE_TAG_NAME, // 标签名前遇到文件结束
  EOF_IN_CDATA, // CDATA中遇到文件结束
  EOF_IN_COMMENT, // 注释中遇到文件结束
  EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT, // 脚本中类似HTML注释的文本遇到文件结束
  EOF_IN_TAG, // 标签中遇到文件结束
  INCORRECTLY_CLOSED_COMMENT, // 不正确关闭的注释
  INCORRECTLY_OPENED_COMMENT, // 不正确打开的注释
  INVALID_FIRST_CHARACTER_OF_TAG_NAME, // 标签名的第一个字符无效
  MISSING_ATTRIBUTE_VALUE, // 缺少属性值
  MISSING_END_TAG_NAME, // 缺少结束标签名
  MISSING_WHITESPACE_BETWEEN_ATTRIBUTES, // 属性之间缺少空格
  NESTED_COMMENT, // 嵌套注释
  UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME, // 属性名中出现意外字符
  UNEXPECTED_CHARACTER_IN_UNQUOTED_ATTRIBUTE_VALUE, // 未引用的属性值中出现意外字符
  UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME, // 属性名前出现意外的等号
  UNEXPECTED_NULL_CHARACTER, // 出现意外的空字符
  UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME, // 标签名位置出现意外的问号
  UNEXPECTED_SOLIDUS_IN_TAG, // 标签中出现意外的斜杠

  
  // Vue特定解析错误
  // 这些错误与Vue模板语法相关
  X_INVALID_END_TAG, // 无效的结束标签
  X_MISSING_END_TAG, // 缺少结束标签
  X_MISSING_INTERPOLATION_END, // 缺少插值结束标记
  X_MISSING_DIRECTIVE_NAME, // 缺少指令名称
  X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END, // 缺少动态指令参数结束标记

  
  // 转换错误
  // 这些错误发生在AST转换阶段
  X_V_IF_NO_EXPRESSION, // v-if缺少表达式
  X_V_IF_SAME_KEY, // v-if和v-else-if使用相同的key
  X_V_ELSE_NO_ADJACENT_IF, // v-else没有相邻的v-if
  X_V_FOR_NO_EXPRESSION, // v-for缺少表达式
  X_V_FOR_MALFORMED_EXPRESSION, // v-for表达式格式错误
  X_V_FOR_TEMPLATE_KEY_PLACEMENT, // 模板v-for的key位置错误
  X_V_BIND_NO_EXPRESSION, // v-bind缺少表达式
  X_V_ON_NO_EXPRESSION, // v-on缺少表达式
  X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET, // 插槽出口上有意外的指令
  X_V_SLOT_MIXED_SLOT_USAGE, // 混合使用不同的插槽语法
  X_V_SLOT_DUPLICATE_SLOT_NAMES, // 重复的插槽名称
  X_V_SLOT_EXTRANEOUS_DEFAULT_SLOT_CHILDREN, // 存在多余的默认插槽子元素
  X_V_SLOT_MISPLACED, // 插槽位置错误
  X_V_MODEL_NO_EXPRESSION, // v-model缺少表达式
  X_V_MODEL_MALFORMED_EXPRESSION, // v-model表达式格式错误
  X_V_MODEL_ON_SCOPE_VARIABLE, // 在作用域变量上使用v-model
  X_V_MODEL_ON_PROPS, // 在props上使用v-model
  X_INVALID_EXPRESSION, // 无效的表达式
  X_KEEP_ALIVE_INVALID_CHILDREN, // keep-alive有无效的子元素

  
  // 通用错误
  // 其他编译器相关错误
  X_PREFIX_ID_NOT_SUPPORTED, // 不支持前缀标识符
  X_MODULE_MODE_NOT_SUPPORTED, // 不支持模块模式
  X_CACHE_HANDLER_NOT_SUPPORTED, // 不支持缓存处理器
  X_SCOPE_ID_NOT_SUPPORTED, // 不支持作用域ID
  X_VNODE_HOOKS, // VNode钩子错误

  // placed here to preserve order for the current minor
  // TODO adjust order in 3.5
  X_V_BIND_INVALID_SAME_NAME_ARGUMENT, // v-bind使用无效的同名参数

  // 高阶编译器用于获取最后一个代码的特殊值
  // 以避免错误代码冲突。这应该始终作为最后一项。
  __EXTEND_POINT__,
}

/**
 * 错误消息映射
 * 为每个错误代码提供对应的错误描述
 * @type {Record<ErrorCodes, string>}
 */
export const errorMessages: Record<ErrorCodes, string> = {
  // parse errors
  [ErrorCodes.ABRUPT_CLOSING_OF_EMPTY_COMMENT]: 'Illegal comment.',
  [ErrorCodes.CDATA_IN_HTML_CONTENT]:
    'CDATA section is allowed only in XML context.',
  [ErrorCodes.DUPLICATE_ATTRIBUTE]: 'Duplicate attribute.',
  [ErrorCodes.END_TAG_WITH_ATTRIBUTES]: 'End tag cannot have attributes.',
  [ErrorCodes.END_TAG_WITH_TRAILING_SOLIDUS]: "Illegal '/' in tags.",
  [ErrorCodes.EOF_BEFORE_TAG_NAME]: 'Unexpected EOF in tag.',
  [ErrorCodes.EOF_IN_CDATA]: 'Unexpected EOF in CDATA section.',
  [ErrorCodes.EOF_IN_COMMENT]: 'Unexpected EOF in comment.',
  [ErrorCodes.EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT]:
    'Unexpected EOF in script.',
  [ErrorCodes.EOF_IN_TAG]: 'Unexpected EOF in tag.',
  [ErrorCodes.INCORRECTLY_CLOSED_COMMENT]: 'Incorrectly closed comment.',
  [ErrorCodes.INCORRECTLY_OPENED_COMMENT]: 'Incorrectly opened comment.',
  [ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME]:
    "Illegal tag name. Use '&lt;' to print '<'.",
  [ErrorCodes.MISSING_ATTRIBUTE_VALUE]: 'Attribute value was expected.',
  [ErrorCodes.MISSING_END_TAG_NAME]: 'End tag name was expected.',
  [ErrorCodes.MISSING_WHITESPACE_BETWEEN_ATTRIBUTES]:
    'Whitespace was expected.',
  [ErrorCodes.NESTED_COMMENT]: "Unexpected '<!--' in comment.",
  [ErrorCodes.UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME]:
    'Attribute name cannot contain U+0022 ("), U+0027 (\'), and U+003C (<).',
  [ErrorCodes.UNEXPECTED_CHARACTER_IN_UNQUOTED_ATTRIBUTE_VALUE]:
    'Unquoted attribute value cannot contain U+0022 ("), U+0027 (\'), U+003C (<), U+003D (=), and U+0060 (`).',
  [ErrorCodes.UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME]:
    "Attribute name cannot start with '='.",
  [ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME]:
    "'<?' is allowed only in XML context.",
  [ErrorCodes.UNEXPECTED_NULL_CHARACTER]: `Unexpected null character.`,
  [ErrorCodes.UNEXPECTED_SOLIDUS_IN_TAG]: "Illegal '/' in tags.",

  // Vue-specific parse errors
  [ErrorCodes.X_INVALID_END_TAG]: 'Invalid end tag.',
  [ErrorCodes.X_MISSING_END_TAG]: 'Element is missing end tag.',
  [ErrorCodes.X_MISSING_INTERPOLATION_END]:
    'Interpolation end sign was not found.',
  [ErrorCodes.X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END]:
    'End bracket for dynamic directive argument was not found. ' +
    'Note that dynamic directive argument cannot contain spaces.',
  [ErrorCodes.X_MISSING_DIRECTIVE_NAME]: 'Legal directive name was expected.',

  // transform errors
  [ErrorCodes.X_V_IF_NO_EXPRESSION]: `v-if/v-else-if is missing expression.`,
  [ErrorCodes.X_V_IF_SAME_KEY]: `v-if/else branches must use unique keys.`,
  [ErrorCodes.X_V_ELSE_NO_ADJACENT_IF]: `v-else/v-else-if has no adjacent v-if or v-else-if.`,
  [ErrorCodes.X_V_FOR_NO_EXPRESSION]: `v-for is missing expression.`,
  [ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION]: `v-for has invalid expression.`,
  [ErrorCodes.X_V_FOR_TEMPLATE_KEY_PLACEMENT]: `<template v-for> key should be placed on the <template> tag.`,
  [ErrorCodes.X_V_BIND_NO_EXPRESSION]: `v-bind is missing expression.`,
  [ErrorCodes.X_V_BIND_INVALID_SAME_NAME_ARGUMENT]: `v-bind with same-name shorthand only allows static argument.`,
  [ErrorCodes.X_V_ON_NO_EXPRESSION]: `v-on is missing expression.`,
  [ErrorCodes.X_V_SLOT_UNEXPECTED_DIRECTIVE_ON_SLOT_OUTLET]: `Unexpected custom directive on <slot> outlet.`,
  [ErrorCodes.X_V_SLOT_MIXED_SLOT_USAGE]:
    `Mixed v-slot usage on both the component and nested <template>. ` +
    `When there are multiple named slots, all slots should use <template> ` +
    `syntax to avoid scope ambiguity.`,
  [ErrorCodes.X_V_SLOT_DUPLICATE_SLOT_NAMES]: `Duplicate slot names found. `,
  [ErrorCodes.X_V_SLOT_EXTRANEOUS_DEFAULT_SLOT_CHILDREN]:
    `Extraneous children found when component already has explicitly named ` +
    `default slot. These children will be ignored.`,
  [ErrorCodes.X_V_SLOT_MISPLACED]: `v-slot can only be used on components or <template> tags.`,
  [ErrorCodes.X_V_MODEL_NO_EXPRESSION]: `v-model is missing expression.`,
  [ErrorCodes.X_V_MODEL_MALFORMED_EXPRESSION]: `v-model value must be a valid JavaScript member expression.`,
  [ErrorCodes.X_V_MODEL_ON_SCOPE_VARIABLE]: `v-model cannot be used on v-for or v-slot scope variables because they are not writable.`,
  [ErrorCodes.X_V_MODEL_ON_PROPS]: `v-model cannot be used on a prop, because local prop bindings are not writable.\nUse a v-bind binding combined with a v-on listener that emits update:x event instead.`,
  [ErrorCodes.X_INVALID_EXPRESSION]: `Error parsing JavaScript expression: `,
  [ErrorCodes.X_KEEP_ALIVE_INVALID_CHILDREN]: `<KeepAlive> expects exactly one child component.`,
  [ErrorCodes.X_VNODE_HOOKS]: `@vnode-* hooks in templates are no longer supported. Use the vue: prefix instead. For example, @vnode-mounted should be changed to @vue:mounted. @vnode-* hooks support has been removed in 3.4.`,

  // generic errors
  [ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED]: `"prefixIdentifiers" option is not supported in this build of compiler.`,
  [ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED]: `ES module mode is not supported in this build of compiler.`,
  [ErrorCodes.X_CACHE_HANDLER_NOT_SUPPORTED]: `"cacheHandlers" option is only supported when the "prefixIdentifiers" option is enabled.`,
  [ErrorCodes.X_SCOPE_ID_NOT_SUPPORTED]: `"scopeId" option is only supported in module mode.`,

  // just to fulfill types
  [ErrorCodes.__EXTEND_POINT__]: ``,
}
