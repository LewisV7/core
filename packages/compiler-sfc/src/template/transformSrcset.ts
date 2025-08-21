/**
 * srcset 属性转换工具
 * 用于处理 HTML 中 img 和 source 标签的 srcset 属性
 * 将其中的相对资源 URL 转换为导入或绝对 URL
 */
import path from 'path'
import {
  ConstantTypes,
  type ExpressionNode,
  type NodeTransform,
  NodeTypes,
  type SimpleExpressionNode,
  createCompoundExpression,
  createSimpleExpression,
} from '@vue/compiler-core'
import {
  isDataUrl,
  isExternalUrl,
  isRelativeUrl,
  parseUrl,
} from './templateUtils'
import {
  type AssetURLOptions,
  defaultAssetUrlOptions,
} from './transformAssetUrl'

const srcsetTags = ['img', 'source']

/**
 * 图像候选对象接口
 * @interface ImageCandidate
 * @property {string} url - 图像 URL
 * @property {string} descriptor - 图像描述符，如像素密度或宽度
 */
interface ImageCandidate {
  url: string
  descriptor: string
}

/**
 * 匹配转义空格字符的正则表达式
 * 用于匹配 srcset 属性值中的各种空白字符
 * 参考: http://w3c.github.io/html/semantics-embedded-content.html#ref-for-image-candidate-string-5
 */
const escapedSpaceCharacters = /( |\t|\n|\f|\r)+/g

/**
 * 创建带有自定义选项的 srcset 转换函数
 * @param {Required<AssetURLOptions>} options - 资源 URL 转换选项
 * @returns {NodeTransform} 返回一个节点转换函数
 */
export const createSrcsetTransformWithOptions = (
  options: Required<AssetURLOptions>,
): NodeTransform => {
  return (node, context) =>
    (transformSrcset as Function)(node, context, options)
}

/**
 * 转换 srcset 属性中的资源 URL
 * @param {Node} node - AST 节点
 * @param {TransformContext} context - 转换上下文
 * @param {Required<AssetURLOptions>} [options=defaultAssetUrlOptions] - 资源 URL 转换选项
 * @returns {void} 无返回值，直接修改节点
 * @example
 * ```html
 * <img srcset="./image.jpg 1x, ./image@2x.jpg 2x">
 * ```
 * 转换后:
 * ```jsx
 * <img srcset={_imports_0 + ' 1x, ' + _imports_1 + ' 2x'}>
 * ```
 */
export const transformSrcset: NodeTransform = (
  node, 
  context, 
  options: Required<AssetURLOptions> = defaultAssetUrlOptions,
) => {
  if (node.type === NodeTypes.ELEMENT) {
    if (srcsetTags.includes(node.tag) && node.props.length) {
      node.props.forEach((attr, index) => {
        if (attr.name === 'srcset' && attr.type === NodeTypes.ATTRIBUTE) {
          if (!attr.value) return
          const value = attr.value.content
          if (!value) return
          const imageCandidates: ImageCandidate[] = value.split(',').map(s => {
            // The attribute value arrives here with all whitespace, except
            // normal spaces, represented by escape sequences
            const [url, descriptor] = s
              .replace(escapedSpaceCharacters, ' ')
              .trim()
              .split(' ', 2)
            return { url, descriptor }
          })

          // data urls contains comma after the encoding so we need to re-merge
          // them
          for (let i = 0; i < imageCandidates.length; i++) {
            const { url } = imageCandidates[i]
            if (isDataUrl(url)) {
              imageCandidates[i + 1].url =
                url + ',' + imageCandidates[i + 1].url
              imageCandidates.splice(i, 1)
            }
          }

          /**
 * 判断是否需要处理 URL
 * @param {string} url - 要判断的 URL
 * @returns {boolean} 如果 URL 需要处理则返回 true
 */
          const shouldProcessUrl = (url: string) => {
            return (
              url &&
              !isExternalUrl(url) &&
              !isDataUrl(url) &&
              (options.includeAbsolute || isRelativeUrl(url))
            )
          }
          // When srcset does not contain any qualified URLs, skip transforming
          if (!imageCandidates.some(({ url }) => shouldProcessUrl(url))) {
            return
          }

          if (options.base) {
            const base = options.base
            const set: string[] = []
            let needImportTransform = false

            imageCandidates.forEach(candidate => {
              let { url, descriptor } = candidate
              descriptor = descriptor ? ` ${descriptor}` : ``
              if (url[0] === '.') {
                candidate.url = (path.posix || path).join(base, url)
                set.push(candidate.url + descriptor)
              } else if (shouldProcessUrl(url)) {
                needImportTransform = true
              } else {
                set.push(url + descriptor)
              }
            })

            if (!needImportTransform) {
              attr.value.content = set.join(', ')
              return
            }
          }

          const compoundExpression = createCompoundExpression([], attr.loc)
          imageCandidates.forEach(({ url, descriptor }, index) => {
            if (shouldProcessUrl(url)) {
              const { path } = parseUrl(url)
              let exp: SimpleExpressionNode
              if (path) {
                const existingImportsIndex = context.imports.findIndex(
                  i => i.path === path,
                )
                if (existingImportsIndex > -1) {
                  exp = createSimpleExpression(
                    `_imports_${existingImportsIndex}`,
                    false,
                    attr.loc,
                    ConstantTypes.CAN_STRINGIFY,
                  )
                } else {
                  exp = createSimpleExpression(
                    `_imports_${context.imports.length}`,
                    false,
                    attr.loc,
                    ConstantTypes.CAN_STRINGIFY,
                  )
                  context.imports.push({ exp, path })
                }
                compoundExpression.children.push(exp)
              }
            } else {
              const exp = createSimpleExpression(
                `"${url}"`,
                false,
                attr.loc,
                ConstantTypes.CAN_STRINGIFY,
              )
              compoundExpression.children.push(exp)
            }
            const isNotLast = imageCandidates.length - 1 > index
            if (descriptor && isNotLast) {
              compoundExpression.children.push(` + ' ${descriptor}, ' + `)
            } else if (descriptor) {
              compoundExpression.children.push(` + ' ${descriptor}'`)
            } else if (isNotLast) {
              compoundExpression.children.push(` + ', ' + `)
            }
          })

          let exp: ExpressionNode = compoundExpression
          if (context.hoistStatic) {
            exp = context.hoist(compoundExpression)
            exp.constType = ConstantTypes.CAN_STRINGIFY
          }

          node.props[index] = {
            type: NodeTypes.DIRECTIVE,
            name: 'bind',
            arg: createSimpleExpression('srcset', true, attr.loc),
            exp,
            modifiers: [],
            loc: attr.loc,
          }
        }
      })
    }
  }
}
