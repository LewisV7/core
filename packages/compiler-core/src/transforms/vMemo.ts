/**
 * v-memo 指令转换处理
 * 该文件实现了 v-memo 指令的转换逻辑，用于优化渲染性能
 */
import type { NodeTransform } from '../transform'
import { findDir } from '../utils'
import {
  ElementTypes,
  type MemoExpression,
  NodeTypes,
  type PlainElementNode,
  convertToBlock,
  createCallExpression,
  createFunctionExpression,
} from '../ast'
import { WITH_MEMO } from '../runtimeHelpers'

// 用于存储已处理过的节点，避免重复处理
const seen = new WeakSet()

/**
 * v-memo 指令转换函数
 * @param {object} node - 当前节点
 * @param {TransformContext} context - 转换上下文
 * @returns {Function|void} - 可能返回一个延迟执行的函数
 */
export const transformMemo: NodeTransform = (node, context) => {
  // 仅处理元素节点
    if (node.type === NodeTypes.ELEMENT) {
      // 查找 memo 指令
      const dir = findDir(node, 'memo')
      // 如果没有找到 memo 指令或节点已处理过，则直接返回
      if (!dir || seen.has(node)) {
        return
      }
      // 标记节点为已处理
      seen.add(node)
      // 返回一个延迟执行的函数
      return () => {
        // 获取代码生成节点
        const codegenNode =
          node.codegenNode ||
          (context.currentNode as PlainElementNode).codegenNode
        // 确保代码生成节点是 VNODE_CALL 类型
        if (codegenNode && codegenNode.type === NodeTypes.VNODE_CALL) {
          // 非组件子树应转换为块
          if (node.tagType !== ElementTypes.COMPONENT) {
            convertToBlock(codegenNode, context)
          }
          // 创建 WITH_MEMO 调用表达式
          node.codegenNode = createCallExpression(context.helper(WITH_MEMO), [
            dir.exp!, // 依赖项表达式
            createFunctionExpression(undefined, codegenNode), // 渲染函数
            `_cache`, // 缓存对象
            String(context.cached.length), // 缓存索引
          ]) as MemoExpression
          // 增加缓存计数
          context.cached.push(null)
        }
      }
    }
}
