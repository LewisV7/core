import { warn } from '@vue/runtime-core'
import type { RendererOptions } from '@vue/runtime-core'
import type {
  TrustedHTML,
  TrustedTypePolicy,
  TrustedTypesWindow,
} from 'trusted-types/lib'

/**
 * Trusted Type策略对象，用于安全地创建HTML内容
 * @type {Pick<TrustedTypePolicy, 'name' | 'createHTML'> | undefined}
 */
let policy: Pick<TrustedTypePolicy, 'name' | 'createHTML'> | undefined =
  undefined

/**
 * 检查是否支持Trusted Types API
 * @type {TrustedTypes | undefined}
 */
const tt =
  typeof window !== 'undefined' &&
  (window as unknown as TrustedTypesWindow).trustedTypes

if (tt) {
  try {
    // 创建Trusted Type策略
    policy = /*@__PURE__*/ tt.createPolicy('vue', {
      createHTML: val => val,
    })
  } catch (e: unknown) {
    // `createPolicy`会在名称重复且CSP trusted-types指令未使用`allow-duplicates`时抛出TypeError
    // 因此我们需要捕获该错误
    __DEV__ && warn(`创建trusted types策略时出错: ${e}`)
  }
}

/**
 * __UNSAFE__ 将字符串转换为TrustedHTML类型
 * @param {string} value - 要转换的字符串值
 * @returns {TrustedHTML | string} 转换后的TrustedHTML对象或原始字符串
 * @warning 此函数潜在不安全，因为它可能被用于设置innerHTML
 * 该函数仅执行类型级别的trusted type转换，用于`innerHTML`赋值等场景
 * 请谨慎对待传递给此函数的任何值
 */
export const unsafeToTrustedHTML: (value: string) => TrustedHTML | string =
  policy ? val => policy.createHTML(val) : val => val

/**
 * SVG命名空间URL
 * @type {string}
 */
export const svgNS = 'http://www.w3.org/2000/svg'

/**
 * MathML命名空间URL
 * @type {string}
 */
export const mathmlNS = 'http://www.w3.org/1998/Math/MathML'

/**
 * 文档对象引用
 * @type {Document}
 */
const doc = (typeof document !== 'undefined' ? document : null) as Document

/**
 * 模板容器元素，用于解析HTML模板
 * @type {HTMLTemplateElement | null}
 */
const templateContainer = doc && /*@__PURE__*/ doc.createElement('template')

/**
 * DOM节点操作对象，实现了Vue渲染器所需的各种节点操作
 * @type {Omit<RendererOptions<Node, Element>, 'patchProp'>}
 *
 * 该对象包含了创建、插入、删除、查询DOM节点等基本操作，
 * 是Vue运行时DOM渲染器的核心工具之一。
 */
export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  /**
   * 将子节点插入到父节点中
   * @param {Node} child - 要插入的子节点
   * @param {Node} parent - 父节点
   * @param {Node | null} anchor - 插入位置的参考节点，子节点将插入到该节点之前
   */
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  /**
   * 从DOM中移除节点
   * @param {Node} child - 要移除的节点
   */
  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  /**
   * 创建DOM元素
   * @param {string} tag - 元素标签名
   * @param {string | null} namespace - 命名空间，如'svg'或'mathml'
   * @param {string | null} is - 自定义元素的类型
   * @param {Object | null} props - 元素属性
   * @returns {Element} 创建的DOM元素
   */
  createElement: (tag, namespace, is, props): Element => {
    // 根据命名空间创建不同类型的元素
    const el =
      namespace === 'svg'
        ? doc.createElementNS(svgNS, tag)
        : namespace === 'mathml'
          ? doc.createElementNS(mathmlNS, tag)
          : is
            ? doc.createElement(tag, { is })
            : doc.createElement(tag)

    // 特殊处理select元素的multiple属性
    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }

    return el
  },

  /**
   * 创建文本节点
   * @param {string} text - 文本内容
   * @returns {Text} 创建的文本节点
   */
  createText: text => doc.createTextNode(text),

  /**
   * 创建注释节点
   * @param {string} text - 注释内容
   * @returns {Comment} 创建的注释节点
   */
  createComment: text => doc.createComment(text),

  /**
   * 设置节点的文本内容
   * @param {Node} node - 要设置文本的节点
   * @param {string} text - 文本内容
   */
  setText: (node, text) => {
    node.nodeValue = text
  },

  /**
   * 设置元素的文本内容
   * @param {Element} el - 要设置文本的元素
   * @param {string} text - 文本内容
   */
  setElementText: (el, text) => {
    el.textContent = text
  },

  /**
   * 获取节点的父节点
   * @param {Node} node - 要获取父节点的节点
   * @returns {Element | null} 父节点，如不存在则为null
   */
  parentNode: node => node.parentNode as Element | null,

  /**
   * 获取节点的下一个兄弟节点
   * @param {Node} node - 参考节点
   * @returns {Node | null} 下一个兄弟节点，如不存在则为null
   */
  nextSibling: node => node.nextSibling,

  /**
   * 根据选择器查询元素
   * @param {string} selector - CSS选择器
   * @returns {Element | null} 匹配的元素，如不存在则为null
   */
  querySelector: selector => doc.querySelector(selector),

  /**
   * 设置元素的作用域ID
   * @param {Element} el - 要设置作用域ID的元素
   * @param {string} id - 作用域ID
   */
  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  /**
   * __UNSAFE__ 插入静态内容
   * @param {string} content - 要插入的静态HTML内容
   * @param {Element} parent - 父元素
   * @param {Node | null} anchor - 插入位置的参考节点
   * @param {string | null} namespace - 命名空间
   * @param {string} start - 开始标记
   * @param {string} end - 结束标记
   * @returns {void}
   * @warning 此函数潜在不安全，因为它使用innerHTML
   * 静态内容只能来自编译后的模板
   * 只要用户只使用受信任的模板，这就是安全的
   */
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    // <parent> before | first ... last | anchor </parent>
    // 确定插入位置的前一个节点
    const before = anchor ? anchor.previousSibling : parent.lastChild
    
    // #5308 只有在以下条件下才能使用缓存路径:
    // - 有单个根节点
    // - nextSibling信息仍然可用
    if (start && (start === end || start.nextSibling)) {
      // 使用缓存路径插入
      while (true) {
        // 克隆节点并插入到参考节点之前
        parent.insertBefore(start!.cloneNode(true), anchor)
        
        // 检查是否已到达结束节点或没有下一个节点
        if (start === end || !(start = start!.nextSibling)) break
      }
    } else {
      // 新鲜插入（没有缓存可用）
      // 使用unsafeToTrustedHTML转换内容并设置到模板容器
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === 'svg'
          ? `<svg>${content}</svg>`
          : namespace === 'mathml'
            ? `<math>${content}</math>`
            : content,
      ) as string

      const template = templateContainer.content
      
      // 如果是svg或mathml命名空间，移除外部包装器
      if (namespace === 'svg' || namespace === 'mathml') {
        const wrapper = template.firstChild!
        // 移动所有子节点到template
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild)
        }
        // 移除包装器
        template.removeChild(wrapper)
      }
      
      // 将模板内容插入到DOM中
      parent.insertBefore(template, anchor)
    }
    
    // 返回插入的第一个和最后一个节点
    return [
      // 第一个节点
      before ? before.nextSibling! : parent.firstChild!,
      // 最后一个节点
      anchor ? anchor.previousSibling! : parent.lastChild!,
    ]
  },
}
