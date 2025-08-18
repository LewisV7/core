/**
 * DOM编译器错误处理模块
 * 定义了DOM编译器相关的错误类型、错误代码和错误消息
 */
import {
  type CompilerError,
  ErrorCodes,
  type SourceLocation,
  createCompilerError,
} from '@vue/compiler-core'

/**
 * DOM编译器错误接口
 * 扩展自核心编译器错误接口，用于表示DOM编译过程中的错误
 */
export interface DOMCompilerError extends CompilerError {
  code: DOMErrorCodes
}

/**
 * 创建DOM编译器错误
 * @param {DOMErrorCodes} code - 错误代码
 * @param {SourceLocation} [loc] - 错误位置信息
 * @returns {DOMCompilerError} 创建的DOM编译器错误对象
 */
export function createDOMCompilerError(
  code: DOMErrorCodes,
  loc?: SourceLocation,
) {
  return createCompilerError(
    code,
    loc,
    __DEV__ || !__BROWSER__ ? DOMErrorMessages : undefined,
  ) as DOMCompilerError
}

/**
 * DOM编译器错误代码枚举
 * 包含DOM编译过程中可能出现的各种错误类型
 */
export enum DOMErrorCodes {
  // v-html指令缺少表达式
  X_V_HTML_NO_EXPRESSION = 53 /* ErrorCodes.__EXTEND_POINT__ */,
  // v-html指令与子元素冲突（v-html会覆盖子元素）
  X_V_HTML_WITH_CHILDREN,
  // v-text指令缺少表达式
  X_V_TEXT_NO_EXPRESSION,
  // v-text指令与子元素冲突（v-text会覆盖子元素）
  X_V_TEXT_WITH_CHILDREN,
  // v-model指令用在无效元素上（只能用在input、textarea和select上）
  X_V_MODEL_ON_INVALID_ELEMENT,
  // 普通元素不支持v-model参数
  X_V_MODEL_ARG_ON_ELEMENT,
  // 文件输入元素不支持v-model（因为它们是只读的）
  X_V_MODEL_ON_FILE_INPUT_ELEMENT,
  // v-model旁不必要的值绑定（会干扰v-model的行为）
  X_V_MODEL_UNNECESSARY_VALUE,
  // v-show指令缺少表达式
  X_V_SHOW_NO_EXPRESSION,
  // Transition组件期望只有一个子元素或组件
  X_TRANSITION_INVALID_CHILDREN,
  // 客户端组件模板中忽略有副作用的标签（script和style）
  X_IGNORED_SIDE_EFFECT_TAG,
  __EXTEND_POINT__,
}

// 测试环境下：确保DOM错误代码与核心错误代码的扩展点正确同步
if (__TEST__) {
  // esbuild cannot infer enum increments if first value is from another
  // file, so we have to manually keep them in sync. this check ensures it
  // errors out if there are collisions.
  if (DOMErrorCodes.X_V_HTML_NO_EXPRESSION < ErrorCodes.__EXTEND_POINT__) {
    throw new Error(
      `DOMErrorCodes need to be updated to ${
        ErrorCodes.__EXTEND_POINT__
      } to match extension point from core ErrorCodes.`,
    )
  }
}

/**
 * DOM编译器错误消息对象
 * 包含每个错误代码对应的错误消息
 */
export const DOMErrorMessages: { [code: number]: string } = {
  [DOMErrorCodes.X_V_HTML_NO_EXPRESSION]: `v-html is missing expression.`,
  [DOMErrorCodes.X_V_HTML_WITH_CHILDREN]: `v-html will override element children.`,
  [DOMErrorCodes.X_V_TEXT_NO_EXPRESSION]: `v-text is missing expression.`,
  [DOMErrorCodes.X_V_TEXT_WITH_CHILDREN]: `v-text will override element children.`,
  [DOMErrorCodes.X_V_MODEL_ON_INVALID_ELEMENT]: `v-model can only be used on <input>, <textarea> and <select> elements.`,
  [DOMErrorCodes.X_V_MODEL_ARG_ON_ELEMENT]: `v-model argument is not supported on plain elements.`,
  [DOMErrorCodes.X_V_MODEL_ON_FILE_INPUT_ELEMENT]: `v-model cannot be used on file inputs since they are read-only. Use a v-on:change listener instead.`,
  [DOMErrorCodes.X_V_MODEL_UNNECESSARY_VALUE]: `Unnecessary value binding used alongside v-model. It will interfere with v-model's behavior.`,
  [DOMErrorCodes.X_V_SHOW_NO_EXPRESSION]: `v-show is missing expression.`,
  [DOMErrorCodes.X_TRANSITION_INVALID_CHILDREN]: `<Transition> expects exactly one child element or component.`,
  [DOMErrorCodes.X_IGNORED_SIDE_EFFECT_TAG]: `Tags with side effect (<script> and <style>) are ignored in client component templates.`,
}
