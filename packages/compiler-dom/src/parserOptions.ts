/**
 * @file 解析器选项配置
 * @description 该模块定义了DOM编译器的解析器选项，包括标签识别、命名空间处理等配置
 */
import { Namespaces, NodeTypes, type ParserOptions } from '@vue/compiler-core'
import { isHTMLTag, isMathMLTag, isSVGTag, isVoidTag } from '@vue/shared'
import { TRANSITION, TRANSITION_GROUP } from './runtimeHelpers'
import { decodeHtmlBrowser } from './decodeHtmlBrowser'

export const parserOptions: ParserOptions = {
  /**
   * 解析模式
   * @description 指定解析器使用HTML模式进行解析
   */
  parseMode: 'html',

  /**
   * 判断是否为空标签
   * @description 引用自@vue/shared的工具函数，用于判断HTML标签是否为空标签
   */
  isVoidTag,

  /**
   * 判断是否为原生标签
   * @description 检查标签是否为HTML、SVG或MathML的原生标签
   * @param {string} tag - 标签名
   * @returns {boolean} 是否为原生标签
   */
  isNativeTag: tag => isHTMLTag(tag) || isSVGTag(tag) || isMathMLTag(tag),

  /**
   * 判断是否为pre标签
   * @description 检查标签是否为<pre>标签
   * @param {string} tag - 标签名
   * @returns {boolean} 是否为pre标签
   */
  isPreTag: tag => tag === 'pre',

  /**
   * 判断是否忽略换行标签
   * @description 检查标签是否为<pre>或<textarea>，这些标签会保留换行符
   * @param {string} tag - 标签名
   * @returns {boolean} 是否忽略换行
   */
  isIgnoreNewlineTag: tag => tag === 'pre' || tag === 'textarea',

  /**
   * 实体解码函数
   * @description 在浏览器环境下使用decodeHtmlBrowser函数解码HTML实体，非浏览器环境下为undefined
   */
  decodeEntities: __BROWSER__ ? decodeHtmlBrowser : undefined,

  /**
   * 判断是否为内置组件
   * @description 检查标签是否为Vue的内置组件（Transition或TransitionGroup）
   * @param {string} tag - 标签名
   * @returns {symbol|undefined} 内置组件的标识符号，如果不是内置组件则返回undefined
   */
  isBuiltInComponent: tag => {
    if (tag === 'Transition' || tag === 'transition') {
      return TRANSITION
    } else if (tag === 'TransitionGroup' || tag === 'transition-group') {
      return TRANSITION_GROUP
    }
  },

  /**
   * 获取命名空间
   * @description 根据标签名、父节点和根命名空间确定当前标签的命名空间
   * @param {string} tag - 标签名
   * @param {ASTNode|undefined} parent - 父节点
   * @param {Namespaces} rootNamespace - 根命名空间
   * @returns {Namespaces} 标签的命名空间
   * @see https://html.spec.whatwg.org/multipage/parsing.html#tree-construction-dispatcher
   */
  getNamespace(tag, parent, rootNamespace) {
    let ns = parent ? parent.ns : rootNamespace
    if (parent && ns === Namespaces.MATH_ML) {
      if (parent.tag === 'annotation-xml') {
        if (tag === 'svg') {
          return Namespaces.SVG
        }
        if (
          parent.props.some(
            a =>
              a.type === NodeTypes.ATTRIBUTE &&
              a.name === 'encoding' &&
              a.value != null &&
              (a.value.content === 'text/html' ||
                a.value.content === 'application/xhtml+xml'),
          )
        ) {
          ns = Namespaces.HTML
        }
      } else if (
        /^m(?:[ions]|text)$/.test(parent.tag) &&
        tag !== 'mglyph' &&
        tag !== 'malignmark'
      ) {
        ns = Namespaces.HTML
      }
    } else if (parent && ns === Namespaces.SVG) {
      if (
        parent.tag === 'foreignObject' ||
        parent.tag === 'desc' ||
        parent.tag === 'title'
      ) {
        ns = Namespaces.HTML
      }
    }

    if (ns === Namespaces.HTML) {
      if (tag === 'svg') {
        return Namespaces.SVG
      }
      if (tag === 'math') {
        return Namespaces.MATH_ML
      }
    }
    return ns
  },
}
