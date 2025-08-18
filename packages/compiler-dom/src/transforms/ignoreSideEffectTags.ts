/**
 * @file ignoreSideEffectTags.ts
 * @description 处理忽略副作用标签的转换逻辑
 * 该模块实现了对HTML中script和style标签的处理，在编译阶段忽略这些具有副作用的标签
 * 避免在客户端渲染时产生不必要的副作用
 */
import { ElementTypes, type NodeTransform, NodeTypes } from '@vue/compiler-core'
import { DOMErrorCodes, createDOMCompilerError } from '../errors'

/**
 * @function ignoreSideEffectTags
 * @description 忽略具有副作用的HTML标签(script和style)
 * @param {Node} node - 要转换的AST节点
 * @param {TransformContext} context - 转换上下文
 * @returns {void} - 无返回值，会修改节点树
 */
export const ignoreSideEffectTags: NodeTransform = (node, context) => {
  // 检查节点是否为HTML元素，并且是script或style标签
  if (
    node.type === NodeTypes.ELEMENT &&
    node.tagType === ElementTypes.ELEMENT &&
    (node.tag === 'script' || node.tag === 'style')
  ) {
    // 在开发环境下发出警告，提示这些标签会被忽略
      __DEV__ &&
      context.onError(
        createDOMCompilerError(
          DOMErrorCodes.X_IGNORED_SIDE_EFFECT_TAG,
          node.loc,
        ),
      )
    // 从节点树中移除该节点
      context.removeNode()
  }
}
