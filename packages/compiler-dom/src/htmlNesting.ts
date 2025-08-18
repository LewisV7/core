/**
 * HTML嵌套验证模块
 * 此模块用于验证HTML元素的嵌套关系是否有效
 *
 * 复制自 https://github.com/MananTank/validate-html-nesting，使用ISC许可证
 * 为避免运行时依赖 validate-html-nesting 库而复制此代码
 * 原始仓库中的此文件不应经常更改，但我们可能需要不时更新它
 */

/**
 * 检查给定的父子元素嵌套是否是有效的HTML
 * @param {string} parent - 父元素标签名
 * @param {string} child - 子元素标签名
 * @returns {boolean} 如果嵌套有效则返回true，否则返回false
 */
export function isValidHTMLNesting(parent: string, child: string): boolean {
  // if the parent is a template, it can have any child
  if (parent === 'template') {
    return true
  }

  // if we know the list of children that are the only valid children for the given parent
  if (parent in onlyValidChildren) {
    return onlyValidChildren[parent].has(child)
  }

  // if we know the list of parents that are the only valid parents for the given child
  if (child in onlyValidParents) {
    return onlyValidParents[child].has(parent)
  }

  // if we know the list of children that are NOT valid for the given parent
  if (parent in knownInvalidChildren) {
    // check if the child is in the list of invalid children
    // if so, return false
    if (knownInvalidChildren[parent].has(child)) return false
  }

  // if we know the list of parents that are NOT valid for the given child
  if (child in knownInvalidParents) {
    // check if the parent is in the list of invalid parents
    // if so, return false
    if (knownInvalidParents[child].has(parent)) return false
  }

  return true
}

// 所有标题标签集合
const headings = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
// 空集合，用于表示没有有效子元素或父元素的情况
const emptySet = new Set([])

/**
 * 映射元素到其唯一有效的子元素集合
 * 只有在此集合中的元素才能作为该元素的子元素
 */
const onlyValidChildren: Record<string, Set<string>> = {
  head: new Set([
    'base',
    'basefront',
    'bgsound',
    'link',
    'meta',
    'title',
    'noscript',
    'noframes',
    'style',
    'script',
    'template',
  ]),
  optgroup: new Set(['option']),
  select: new Set(['optgroup', 'option', 'hr']),
  // table
  table: new Set(['caption', 'colgroup', 'tbody', 'tfoot', 'thead']),
  tr: new Set(['td', 'th']),
  colgroup: new Set(['col']),
  tbody: new Set(['tr']),
  thead: new Set(['tr']),
  tfoot: new Set(['tr']),
  // these elements can not have any children elements
  script: emptySet,
  iframe: emptySet,
  option: emptySet,
  textarea: emptySet,
  style: emptySet,
  title: emptySet,
}

/**
 * 映射元素到其唯一有效的父元素集合
 * 只有在此集合中的元素才能作为该元素的父元素
 */
const onlyValidParents: Record<string, Set<string>> = {
  // sections
  html: emptySet,
  body: new Set(['html']),
  head: new Set(['html']),
  // table
  td: new Set(['tr']),
  colgroup: new Set(['table']),
  caption: new Set(['table']),
  tbody: new Set(['table']),
  tfoot: new Set(['table']),
  col: new Set(['colgroup']),
  th: new Set(['tr']),
  thead: new Set(['table']),
  tr: new Set(['tbody', 'thead', 'tfoot']),
  // data list
  dd: new Set(['dl', 'div']),
  dt: new Set(['dl', 'div']),
  // other
  figcaption: new Set(['figure']),
  // li: new Set(["ul", "ol"]),
  summary: new Set(['details']),
  area: new Set(['map']),
} as const

/**
 * 映射元素到其无效的子元素集合
 * 在此集合中的元素不能作为该元素的子元素
 */
const knownInvalidChildren: Record<string, Set<string>> = {
  p: new Set([
    'address',
    'article',
    'aside',
    'blockquote',
    'center',
    'details',
    'dialog',
    'dir',
    'div',
    'dl',
    'fieldset',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'hr',
    'li',
    'main',
    'nav',
    'menu',
    'ol',
    'p',
    'pre',
    'section',
    'table',
    'ul',
  ]),
  svg: new Set([
    'b',
    'blockquote',
    'br',
    'code',
    'dd',
    'div',
    'dl',
    'dt',
    'em',
    'embed',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'menu',
    'meta',
    'ol',
    'p',
    'pre',
    'ruby',
    's',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'u',
    'ul',
    'var',
  ]),
} as const

/**
 * 映射元素到其无效的父元素集合
 * 在此集合中的元素不能作为该元素的父元素
 */
const knownInvalidParents: Record<string, Set<string>> = {
  a: new Set(['a']),
  button: new Set(['button']),
  dd: new Set(['dd', 'dt']),
  dt: new Set(['dd', 'dt']),
  form: new Set(['form']),
  li: new Set(['li']),
  h1: headings,
  h2: headings,
  h3: headings,
  h4: headings,
  h5: headings,
  h6: headings,
}
