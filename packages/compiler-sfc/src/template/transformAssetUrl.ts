/**
 * 资源URL转换工具
 * 用于将模板中的相对资源URL转换为导入或绝对URL
 */
import path from 'path'
import {
  ConstantTypes,
  type ExpressionNode,
  type NodeTransform,
  NodeTypes,
  type SimpleExpressionNode,
  type SourceLocation,
  type TransformContext,
  createSimpleExpression,
} from '@vue/compiler-core'
import {
  isDataUrl,
  isExternalUrl,
  isRelativeUrl,
  parseUrl,
} from './templateUtils'
import { isArray } from '@vue/shared'

/**
 * 资源URL标签配置
 * 定义哪些标签的哪些属性需要进行资源URL转换
 */
export interface AssetURLTagConfig {
  [name: string]: string[]
}

/**
 * 资源URL转换选项
 */
export interface AssetURLOptions {
  /**
   * 如果提供了base，相对资源URL将被直接重写为绝对URL，而不是转换为导入
   */
  base?: string | null
  /**
   * 如果为true，也会处理绝对URL
   */
  includeAbsolute?: boolean
  /**
   * 定义哪些标签的哪些属性需要进行资源URL转换
   */
  tags?: AssetURLTagConfig
}

/**
 * 默认资源URL转换选项
 */
export const defaultAssetUrlOptions: Required<AssetURLOptions> = {
  base: null,
  includeAbsolute: false,
  tags: {
    video: ['src', 'poster'],
    source: ['src'],
    img: ['src'],
    image: ['xlink:href', 'href'],
    use: ['xlink:href', 'href'],
  },
}

/**
 * 规范化资源URL转换选项
 * @param {AssetURLOptions | AssetURLTagConfig} options - 输入选项
 * @returns {Required<AssetURLOptions>} 规范化后的选项
 */
export const normalizeOptions = (
  options: AssetURLOptions | AssetURLTagConfig,
): Required<AssetURLOptions> => {
  if (Object.keys(options).some(key => isArray((options as any)[key]))) {
    // legacy option format which directly passes in tags config
    return {
      ...defaultAssetUrlOptions,
      tags: options as any,
    }
  }
  return {
    ...defaultAssetUrlOptions,
    ...options,
  }
}

/**
 * 创建带有指定选项的资源URL转换函数
 * @param {Required<AssetURLOptions>} options - 资源URL转换选项
 * @returns {NodeTransform} 节点转换函数
 */
export const createAssetUrlTransformWithOptions = (
  options: Required<AssetURLOptions>,
): NodeTransform => {
  return (node, context) =>
    (transformAssetUrl as Function)(node, context, options)
}

/**
 * `@vue/compiler-core`插件，用于将相对资源URL转换为导入或绝对URL
 *
 * ``` js
 * // 转换前
 * createVNode('img', { src: './logo.png' })
 *
 * // 转换后
 * import _imports_0 from './logo.png'
 * createVNode('img', { src: _imports_0 })
 * ```
 * @param {Node} node - 节点
 * @param {TransformContext} context - 转换上下文
 * @param {AssetURLOptions} [options=defaultAssetUrlOptions] - 转换选项
 * @returns {void} 无返回值
 */
export const transformAssetUrl: NodeTransform = (
  node,
  context,
  options: AssetURLOptions = defaultAssetUrlOptions,
) => {
  if (node.type === NodeTypes.ELEMENT) {
    if (!node.props.length) {
      return
    }

    const tags = options.tags || defaultAssetUrlOptions.tags
    const attrs = tags[node.tag]
    const wildCardAttrs = tags['*']
    if (!attrs && !wildCardAttrs) {
      return
    }

    const assetAttrs = (attrs || []).concat(wildCardAttrs || [])
    node.props.forEach((attr, index) => {
      if (
        attr.type !== NodeTypes.ATTRIBUTE ||
        !assetAttrs.includes(attr.name) ||
        !attr.value ||
        isExternalUrl(attr.value.content) ||
        isDataUrl(attr.value.content) ||
        attr.value.content[0] === '#' ||
        (!options.includeAbsolute && !isRelativeUrl(attr.value.content))
      ) {
        return
      }

      const url = parseUrl(attr.value.content)
      if (options.base && attr.value.content[0] === '.') {
        // explicit base - directly rewrite relative urls into absolute url
        // to avoid generating extra imports
        // Allow for full hostnames provided in options.base
        const base = parseUrl(options.base)
        const protocol = base.protocol || ''
        const host = base.host ? protocol + '//' + base.host : ''
        const basePath = base.path || '/'

        // when packaged in the browser, path will be using the posix-
        // only version provided by rollup-plugin-node-builtins.
        attr.value.content =
          host +
          (path.posix || path).join(basePath, url.path + (url.hash || ''))
        return
      }

      // otherwise, transform the url into an import.
      // this assumes a bundler will resolve the import into the correct
      // absolute url (e.g. webpack file-loader)
      const exp = getImportsExpressionExp(url.path, url.hash, attr.loc, context)
      node.props[index] = {
        type: NodeTypes.DIRECTIVE,
        name: 'bind',
        arg: createSimpleExpression(attr.name, true, attr.loc),
        exp,
        modifiers: [],
        loc: attr.loc,
      }
    })
  }
}

/**
 * 获取导入表达式
 * @param {string | null} path - 文件路径
 * @param {string | null} hash - URL哈希值
 * @param {SourceLocation} loc - 源代码位置
 * @param {TransformContext} context - 转换上下文
 * @returns {ExpressionNode} 表达式节点
 */
function getImportsExpressionExp(
  path: string | null,
  hash: string | null,
  loc: SourceLocation,
  context: TransformContext,
): ExpressionNode {
  if (path) {
    let name: string
    let exp: SimpleExpressionNode
    const existingIndex = context.imports.findIndex(i => i.path === path)
    if (existingIndex > -1) {
      name = `_imports_${existingIndex}`
      exp = context.imports[existingIndex].exp as SimpleExpressionNode
    } else {
      name = `_imports_${context.imports.length}`
      exp = createSimpleExpression(
        name,
        false,
        loc,
        ConstantTypes.CAN_STRINGIFY,
      )

      // We need to ensure the path is not encoded (to %2F),
      // so we decode it back in case it is encoded
      context.imports.push({
        exp,
        path: decodeURIComponent(path),
      })
    }

    if (!hash) {
      return exp
    }

    const hashExp = `${name} + '${hash}'`
    const finalExp = createSimpleExpression(
      hashExp,
      false,
      loc,
      ConstantTypes.CAN_STRINGIFY,
    )

    if (!context.hoistStatic) {
      return finalExp
    }

    const existingHoistIndex = context.hoists.findIndex(h => {
      return (
        h &&
        h.type === NodeTypes.SIMPLE_EXPRESSION &&
        !h.isStatic &&
        h.content === hashExp
      )
    })
    if (existingHoistIndex > -1) {
      return createSimpleExpression(
        `_hoisted_${existingHoistIndex + 1}`,
        false,
        loc,
        ConstantTypes.CAN_STRINGIFY,
      )
    }
    return context.hoist(finalExp)
  } else {
    return createSimpleExpression(`''`, false, loc, ConstantTypes.CAN_STRINGIFY)
  }
}
