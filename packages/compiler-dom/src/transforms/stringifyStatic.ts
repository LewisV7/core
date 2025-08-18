/**
 * 将静态节点树转换为字符串化静态节点的优化模块
 * 此模块仅在Node.js环境中运行
 * 负责将连续的静态节点转换为单个静态vnode调用，以减少渲染开销
 */
import {
  CREATE_STATIC,
  type CacheExpression,
  ConstantTypes,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type HoistTransform,
  Namespaces,
  NodeTypes,
  type PlainElementNode,
  type SimpleExpressionNode,
  type TemplateChildNode,
  type TextCallNode,
  type TransformContext,
  createCallExpression,
  isStaticArgOf,
} from '@vue/compiler-core'
import {
  escapeHtml,
  isArray,
  isBooleanAttr,
  isKnownHtmlAttr,
  isKnownMathMLAttr,
  isKnownSvgAttr,
  isString,
  isSymbol,
  isVoidTag,
  makeMap,
  normalizeClass,
  normalizeStyle,
  stringifyStyle,
  toDisplayString,
} from '@vue/shared'

/**
 * 字符串化阈值枚举
 * 定义了触发节点字符串化的条件
 */
export enum StringifyThresholds {
  // 包含绑定的元素数量阈值
  ELEMENT_WITH_BINDING_COUNT = 5,
  // 节点总数阈值
  NODE_COUNT = 20,
}

/**
 * 可字符串化的节点类型
 * 包括普通元素节点和文本调用节点
 */
type StringifiableNode = PlainElementNode | TextCallNode

/**
 * 用于替换嵌入常量变量占位符的正则表达式
 * 例如处理编译器SFC生成的导入URL字符串常量
 */
const expReplaceRE = /__VUE_EXP_START__(.*?)__VUE_EXP_END__/g

/**
 * 将符合条件的提升静态树转换为字符串化静态节点
 * @function stringifyStatic
 * @description 将连续的静态节点转换为单个静态vnode调用，以优化渲染性能
 * @param {TemplateChildNode[]} children - 子节点数组
 * @param {TransformContext} context - 转换上下文
 * @param {ElementNode | null} parent - 父节点
 * @returns {void} 无返回值，直接修改传入的children数组
 *
 * 一个静态vnode可以包含多个连续节点（元素和纯文本）的字符串化内容，称为"块"。
 * `@vue/runtime-dom`会通过隐藏容器元素的innerHTML创建内容，并将所有节点插入到位。
 * 调用还必须提供块中包含的节点数量，以便在水合期间知道静态vnode应该采用多少个节点。
 *
 * 优化会扫描包含提升节点的子节点列表，并尝试在遇到非提升节点或列表末尾之前找到最大的连续提升节点块。
 * 然后将块转换为单个静态vnode，并替换块中第一个节点的提升表达式。块中的其他节点被视为"合并"，
 * 因此从提升列表和子节点数组中删除。
 *
 * 此优化仅在Node.js中执行。
 */
export const stringifyStatic: HoistTransform = (children, context, parent) => {
  // 跳过插槽内容的字符串化
  if (context.scopes.vSlot > 0) {
    return
  }

  // 检查父节点是否已缓存
  const isParentCached =
    parent.type === NodeTypes.ELEMENT &&
    parent.codegenNode &&
    parent.codegenNode.type === NodeTypes.VNODE_CALL &&
    parent.codegenNode.children &&
    !isArray(parent.codegenNode.children) &&
    parent.codegenNode.children.type === NodeTypes.JS_CACHE_EXPRESSION

  let nc = 0 // 当前节点计数
  let ec = 0 // 当前包含绑定的元素计数
  const currentChunk: StringifiableNode[] = [] // 当前处理的节点块

  // 字符串化当前节点块
  const stringifyCurrentChunk = (currentIndex: number): number => {
    // 检查是否达到字符串化阈值
    if (
      nc >= StringifyThresholds.NODE_COUNT ||
      ec >= StringifyThresholds.ELEMENT_WITH_BINDING_COUNT
    ) {
      // 将所有符合条件的节点合并为单个静态vnode调用
      const staticCall = createCallExpression(context.helper(CREATE_STATIC), [
        // 字符串化节点内容并替换表达式占位符
        JSON.stringify(
          currentChunk.map(node => stringifyNode(node, context)).join(''),
        ).replace(expReplaceRE, `" + $1 + "`), // 替换嵌入的表达式占位符
        // 第二个参数表示此静态vnode将插入/水合的DOM节点数量
        // the 2nd argument indicates the number of DOM nodes this static vnode
        // will insert / hydrate
        String(currentChunk.length),
      ])

      const deleteCount = currentChunk.length - 1

      // 如果父节点已缓存
      if (isParentCached) {
        // 如果父节点已缓存，则`children`也是CacheExpression的值
        // 只需用staticCall替换缓存列表中的相应范围
        // CacheExpression. Just replace the corresponding range in the cached
        // list with staticCall.
        children.splice(
          currentIndex - currentChunk.length,
          currentChunk.length,
          // @ts-expect-error
          staticCall,
        )
        // 如果父节点未缓存
      } else {
        // 用静态vnode调用替换第一个节点的提升表达式
        ;(currentChunk[0].codegenNode as CacheExpression).value = staticCall
        // 如果块中有多个节点
        if (currentChunk.length > 1) {
          // 从子节点中删除合并的节点
          children.splice(currentIndex - currentChunk.length + 1, deleteCount)
          // 同时调整剩余缓存项的索引
          const cacheIndex = context.cached.indexOf(
            currentChunk[currentChunk.length - 1]
              .codegenNode as CacheExpression,
          )
          // 如果找到缓存索引
          if (cacheIndex > -1) {
            // 调整后续缓存项的索引
            for (let i = cacheIndex; i < context.cached.length; i++) {
              const c = context.cached[i]
              if (c) c.index -= deleteCount // 减少索引值
            }
            // 从缓存中删除合并的节点
            context.cached.splice(cacheIndex - deleteCount + 1, deleteCount)
          }
        }
      }
      // 返回删除的节点数量
      return deleteCount
    }
    // 未达到阈值，返回0
    return 0
  }

  // 遍历所有子节点
  let i = 0
  for (; i < children.length; i++) {
    const child = children[i] // 当前子节点
    const isCached = isParentCached || getCachedNode(child) // 检查节点是否已缓存
    // 如果节点已缓存
    if (isCached) {
      // 缓存的存在意味着子节点必须是可字符串化的节点
      const result = analyzeNode(child as StringifiableNode)
      // 如果节点可字符串化
      if (result) {
        // 节点可字符串化，记录状态
        nc += result[0]
        ec += result[1]
        currentChunk.push(child as StringifiableNode)
        continue
      }
    }
    // 只有在遇到不可字符串化的节点时才会到达这里
    // 检查当前分析的节点是否满足字符串化条件
    // 调整迭代索引
    // check if currently analyzed nodes meet criteria for stringification.
    // adjust iteration index
    i -= stringifyCurrentChunk(i)
    // 重置状态
    nc = 0
    ec = 0
    currentChunk.length = 0
  }
  // 处理最后一个节点也是可字符串化的情况
  stringifyCurrentChunk(i)
}

/**
 * 获取缓存的节点
 * @param {TemplateChildNode} node - 模板子节点
 * @returns {CacheExpression | undefined} 缓存表达式或undefined
 */
const getCachedNode = (
  node: TemplateChildNode,
): CacheExpression | undefined => {
  if (
    ((node.type === NodeTypes.ELEMENT &&
      node.tagType === ElementTypes.ELEMENT) ||
      node.type === NodeTypes.TEXT_CALL) &&
    node.codegenNode &&
    node.codegenNode.type === NodeTypes.JS_CACHE_EXPRESSION
  ) {
    return node.codegenNode
  }
}

/**
 * 匹配data-*和aria-*属性的正则表达式
 */
const dataAriaRE = /^(data|aria)-/
/**
 * 检查属性是否可字符串化
 * @param {string} name - 属性名
 * @param {Namespaces} ns - 命名空间
 * @returns {boolean} 是否可字符串化
 */
const isStringifiableAttr = (name: string, ns: Namespaces) => {
  // 检查是否为已知属性或data-*/aria-*属性
  return (
    (ns === Namespaces.HTML
      ? isKnownHtmlAttr(name)
      : ns === Namespaces.SVG
        ? isKnownSvgAttr(name)
        : ns === Namespaces.MATH_ML
          ? isKnownMathMLAttr(name)
          : false) || dataAriaRE.test(name)
  )
}

/**
 * 检查标签是否不可字符串化
 */
const isNonStringifiable = /*@__PURE__*/ makeMap(
  `caption,thead,tr,th,tbody,td,tfoot,colgroup,col`,
)

/**
 * for a cached node, analyze it and return:
 * - false: bailed (contains non-stringifiable props or runtime constant)
 * - [nc, ec] where
 *   - nc is the number of nodes inside
 *   - ec is the number of element with bindings inside
 */
function analyzeNode(node: StringifiableNode): [number, number] | false {
  if (node.type === NodeTypes.ELEMENT && isNonStringifiable(node.tag)) {
    return false
  }

  if (node.type === NodeTypes.TEXT_CALL) {
    return [1, 0]
  }

  let nc = 1 // node count
  let ec = node.props.length > 0 ? 1 : 0 // element w/ binding count
  let bailed = false
  const bail = (): false => {
    bailed = true
    return false
  }

  // TODO: check for cases where using innerHTML will result in different
  // output compared to imperative node insertions.
  // probably only need to check for most common case
  // i.e. non-phrasing-content tags inside `<p>`
  function walk(node: ElementNode): boolean {
    const isOptionTag = node.tag === 'option' && node.ns === Namespaces.HTML
    for (let i = 0; i < node.props.length; i++) {
      const p = node.props[i]
      // bail on non-attr bindings
      if (
        p.type === NodeTypes.ATTRIBUTE &&
        !isStringifiableAttr(p.name, node.ns)
      ) {
        return bail()
      }
      if (p.type === NodeTypes.DIRECTIVE && p.name === 'bind') {
        // bail on non-attr bindings
        if (
          p.arg &&
          (p.arg.type === NodeTypes.COMPOUND_EXPRESSION ||
            (p.arg.isStatic && !isStringifiableAttr(p.arg.content, node.ns)))
        ) {
          return bail()
        }
        if (
          p.exp &&
          (p.exp.type === NodeTypes.COMPOUND_EXPRESSION ||
            p.exp.constType < ConstantTypes.CAN_STRINGIFY)
        ) {
          return bail()
        }
        // <option :value="1"> cannot be safely stringified
        if (
          isOptionTag &&
          isStaticArgOf(p.arg, 'value') &&
          p.exp &&
          !p.exp.isStatic
        ) {
          return bail()
        }
      }
    }
    for (let i = 0; i < node.children.length; i++) {
      nc++
      const child = node.children[i]
      if (child.type === NodeTypes.ELEMENT) {
        if (child.props.length > 0) {
          ec++
        }
        walk(child)
        if (bailed) {
          return false
        }
      }
    }
    return true
  }

  return walk(node) ? [nc, ec] : false
}

function stringifyNode(
  node: string | TemplateChildNode,
  context: TransformContext,
): string {
  if (isString(node)) {
    return node
  }
  if (isSymbol(node)) {
    return ``
  }
  switch (node.type) {
    case NodeTypes.ELEMENT:
      return stringifyElement(node, context)
    case NodeTypes.TEXT:
      return escapeHtml(node.content)
    case NodeTypes.COMMENT:
      return `<!--${escapeHtml(node.content)}-->`
    case NodeTypes.INTERPOLATION:
      return escapeHtml(toDisplayString(evaluateConstant(node.content)))
    case NodeTypes.COMPOUND_EXPRESSION:
      return escapeHtml(evaluateConstant(node))
    case NodeTypes.TEXT_CALL:
      return stringifyNode(node.content, context)
    default:
      // static trees will not contain if/for nodes
      return ''
  }
}

function stringifyElement(
  node: ElementNode,
  context: TransformContext,
): string {
  let res = `<${node.tag}`
  let innerHTML = ''
  for (let i = 0; i < node.props.length; i++) {
    const p = node.props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      res += ` ${p.name}`
      if (p.value) {
        res += `="${escapeHtml(p.value.content)}"`
      }
    } else if (p.type === NodeTypes.DIRECTIVE) {
      if (p.name === 'bind') {
        const exp = p.exp as SimpleExpressionNode
        if (exp.content[0] === '_') {
          // internally generated string constant references
          // e.g. imported URL strings via compiler-sfc transformAssetUrl plugin
          res += ` ${
            (p.arg as SimpleExpressionNode).content
          }="__VUE_EXP_START__${exp.content}__VUE_EXP_END__"`
          continue
        }
        // #6568
        if (
          isBooleanAttr((p.arg as SimpleExpressionNode).content) &&
          exp.content === 'false'
        ) {
          continue
        }
        // constant v-bind, e.g. :foo="1"
        let evaluated = evaluateConstant(exp)
        if (evaluated != null) {
          const arg = p.arg && (p.arg as SimpleExpressionNode).content
          if (arg === 'class') {
            evaluated = normalizeClass(evaluated)
          } else if (arg === 'style') {
            evaluated = stringifyStyle(normalizeStyle(evaluated))
          }
          res += ` ${(p.arg as SimpleExpressionNode).content}="${escapeHtml(
            evaluated,
          )}"`
        }
      } else if (p.name === 'html') {
        // #5439 v-html with constant value
        // not sure why would anyone do this but it can happen
        innerHTML = evaluateConstant(p.exp as SimpleExpressionNode)
      } else if (p.name === 'text') {
        innerHTML = escapeHtml(
          toDisplayString(evaluateConstant(p.exp as SimpleExpressionNode)),
        )
      }
    }
  }
  if (context.scopeId) {
    res += ` ${context.scopeId}`
  }
  res += `>`
  if (innerHTML) {
    res += innerHTML
  } else {
    for (let i = 0; i < node.children.length; i++) {
      res += stringifyNode(node.children[i], context)
    }
  }
  if (!isVoidTag(node.tag)) {
    res += `</${node.tag}>`
  }
  return res
}

// __UNSAFE__
// Reason: eval.
// It's technically safe to eval because only constant expressions are possible
// here, e.g. `{{ 1 }}` or `{{ 'foo' }}`
// in addition, constant exps bail on presence of parens so you can't even
// run JSFuck in here. But we mark it unsafe for security review purposes.
// (see compiler-core/src/transforms/transformExpression)
function evaluateConstant(exp: ExpressionNode): string {
  if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
    return new Function(`return (${exp.content})`)()
  } else {
    // compound
    let res = ``
    exp.children.forEach(c => {
      if (isString(c) || isSymbol(c)) {
        return
      }
      if (c.type === NodeTypes.TEXT) {
        res += c.content
      } else if (c.type === NodeTypes.INTERPOLATION) {
        res += toDisplayString(evaluateConstant(c.content))
      } else {
        res += evaluateConstant(c as ExpressionNode)
      }
    })
    return res
  }
}
