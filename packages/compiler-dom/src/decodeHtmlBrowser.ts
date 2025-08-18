/**
 * 浏览器环境下的HTML解码工具
 * 此模块提供了在浏览器环境中将HTML字符串解码为普通文本的功能
 */
/* eslint-disable no-restricted-globals */

// 用于解码HTML的DOM元素
let decoder: HTMLDivElement

/**
 * 在浏览器环境中解码HTML字符串
 * @param {string} raw - 需要解码的原始HTML字符串
 * @param {boolean} [asAttr=false] - 是否作为属性值进行解码
 * @returns {string} 解码后的字符串
 */
export function decodeHtmlBrowser(raw: string, asAttr = false): string {
  // 如果解码器不存在，则创建一个新的div元素
  if (!decoder) {
    decoder = document.createElement('div')
  }
  // 作为属性值解码
  if (asAttr) {
    decoder.innerHTML = `<div foo="${raw.replace(/"/g, '&quot;')}">`
    return decoder.children[0].getAttribute('foo')!
  // 作为HTML内容解码
  } else {
    decoder.innerHTML = raw
    // 返回解码后的文本内容
    return decoder.textContent!
  }
}
