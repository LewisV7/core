/**
 * 用于匹配需要转义的HTML特殊字符的正则表达式
 * 匹配: 双引号(")、单引号(')、&、<、>
 */
const escapeRE = /["'&<>]/

/**
 * 将输入字符串中的HTML特殊字符转义为对应的HTML实体
 * @param {unknown} string - 需要转义的输入，可以是任何类型，会被转换为字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(string: unknown): string {
  const str = '' + string
  const match = escapeRE.exec(str)

  if (!match) {
    return str
  }

  let html = ''
  let escaped: string
  let index: number
  let lastIndex = 0
  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escaped = '&quot;'
        break
      case 38: // &
        escaped = '&amp;'
        break
      case 39: // '
        escaped = '&#39;'
        break
      case 60: // <
        escaped = '&lt;'
        break
      case 62: // >
        escaped = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) {
      html += str.slice(lastIndex, index)
    }

    lastIndex = index + 1
    html += escaped
  }

  return lastIndex !== index ? html + str.slice(lastIndex, index) : html
}

/**
 * 用于清理HTML注释的正则表达式
 * 匹配HTML注释的开始和结束标记
 * 参考: https://www.w3.org/TR/html52/syntax.html#comments
 */
const commentStripRE = /^-?>|<!--|-->|--!>|<!-$/g

/**
 * 清理HTML注释中的特殊标记
 * @param {string} src - 包含HTML注释的字符串
 * @returns {string} 清理后的字符串
 */
export function escapeHtmlComment(src: string): string {
  return src.replace(commentStripRE, '')
}

/**
 * 用于匹配CSS变量名称中需要转义的特殊符号的正则表达式
 */
export const cssVarNameEscapeSymbolsRE: RegExp =
  /[ !"#$%&'()*+,./:;<=>?@[\\]^`{|}~]/g

/**
 * 获取转义后的CSS变量名称
 * @param {string} key - CSS变量名称
 * @param {boolean} doubleEscape - 是否需要双重转义
 * @returns {string} 转义后的CSS变量名称
 */
export function getEscapedCssVarName(
  key: string,
  doubleEscape: boolean,
): string {
  return key.replace(cssVarNameEscapeSymbolsRE, s =>
    doubleEscape ? (s === '"' ? '\\\\\\"' : `\\\\${s}`) : `\\${s}`,
  )
}
