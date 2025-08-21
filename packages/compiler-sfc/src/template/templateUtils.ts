/**
 * 模板工具函数
 * 提供与URL处理相关的实用工具函数，用于解析和判断不同类型的URL
 */
import { type UrlWithStringQuery, parse as uriParse } from 'url'
import { isString } from '@vue/shared'

/**
 * 判断是否为相对URL
 * @param {string} url - 要检查的URL字符串
 * @returns {boolean} 是否为相对URL
 * @description 以.、~或@开头的URL被视为相对URL
 */
export function isRelativeUrl(url: string): boolean {
  const firstChar = url.charAt(0)
  return firstChar === '.' || firstChar === '~' || firstChar === '@'
}

/**
 * 判断是否为外部URL
 * @param {string} url - 要检查的URL字符串
 * @returns {boolean} 是否为外部URL
 * @description 以http://或https://开头的URL被视为外部URL
 */
const externalRE = /^(https?:)?\/\//
export function isExternalUrl(url: string): boolean {
  return externalRE.test(url)
}

/**
 * 判断是否为数据URL
 * @param {string} url - 要检查的URL字符串
 * @returns {boolean} 是否为数据URL
 * @description 以data:开头的URL被视为数据URL
 */
const dataUrlRE = /^\s*data:/i
export function isDataUrl(url: string): boolean {
  return dataUrlRE.test(url)
}

/**
 * 解析URL字符串为URL对象
 * @param {string} url - 要解析的URL字符串
 * @returns {UrlWithStringQuery} 解析后的URL对象
 * @description 支持处理以~开头的URL路径
 */
export function parseUrl(url: string): UrlWithStringQuery {
  const firstChar = url.charAt(0)
  if (firstChar === '~') {
    const secondChar = url.charAt(1)
    url = url.slice(secondChar === '/' ? 2 : 1)
  }
  return parseUriParts(url)
}

/**
 * 解析URI部分
 * @param {string} urlString - URL字符串
 * @returns {UrlWithStringQuery} 解析后的URL对象
 * @description 支持在转换后的require中处理URI片段
 */
function parseUriParts(urlString: string): UrlWithStringQuery {
  // A TypeError is thrown if urlString is not a string
  // @see https://nodejs.org/api/url.html#url_url_parse_urlstring_parsequerystring_slashesdenotehost
  return uriParse(isString(urlString) ? urlString : '', false, true)
}
