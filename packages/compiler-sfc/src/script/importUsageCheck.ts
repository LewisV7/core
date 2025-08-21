// 导入使用检查模块
// 此模块用于检查单文件组件(SFC)模板中导入的标识符是否被使用
// 主要用于确定非内联模式下setup()函数应返回的属性

import type { SFCDescriptor } from '../parse'
import {
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  type TemplateChildNode,
  parserOptions,
  walkIdentifiers,
} from '@vue/compiler-dom'
import { createCache } from '../cache'
import { camelize, capitalize, isBuiltInDirective } from '@vue/shared'

/**
 * 检查导入的标识符是否在SFC模板中使用
 * 用于确定非内联模式下setup()函数应返回的属性
 * @param local - 要检查的本地标识符名称
 * @param sfc - SFC描述符对象
 * @returns 标识符是否被使用
 */
export function isImportUsed(local: string, sfc: SFCDescriptor): boolean {
  return resolveTemplateUsedIdentifiers(sfc).has(local)
}

// 创建模板使用检查缓存
// 用于缓存已解析的模板标识符，避免重复解析提高性能
const templateUsageCheckCache = createCache<Set<string>>()

/**
 * 解析模板中使用的所有标识符
 * @param sfc - SFC描述符对象
 * @returns 模板中使用的标识符集合
 */
function resolveTemplateUsedIdentifiers(sfc: SFCDescriptor): Set<string> {
  const { content, ast } = sfc.template!
  // 检查缓存，如果存在则直接返回
  const cached = templateUsageCheckCache.get(content)
  if (cached) {
    return cached
  }

  const ids = new Set<string>()

  // 遍历模板AST的所有子节点
  ast!.children.forEach(walk)

  /**
   * 遍历AST节点，提取使用的标识符
   * @param node - 要遍历的模板子节点
   */
  function walk(node: TemplateChildNode) {
    switch (node.type) {
      case NodeTypes.ELEMENT:
        let tag = node.tag
        // 处理带点的标签名，如<el-button.type>
        if (tag.includes('.')) tag = tag.split('.')[0].trim()
        // 检查是否为自定义组件标签
        if (
          !parserOptions.isNativeTag!(tag) &&
          !parserOptions.isBuiltInComponent!(tag)
        ) {
          // 添加组件名的驼峰式和首字母大写形式
          ids.add(camelize(tag))
          ids.add(capitalize(camelize(tag)))
        }
        // 处理元素的所有属性
        for (let i = 0; i < node.props.length; i++) {
          const prop = node.props[i]
          if (prop.type === NodeTypes.DIRECTIVE) {
            // 处理自定义指令
            if (!isBuiltInDirective(prop.name)) {
              ids.add(`v${capitalize(camelize(prop.name))}`)
            }

            // 处理动态指令参数
            if (prop.arg && !(prop.arg as SimpleExpressionNode).isStatic) {
              extractIdentifiers(ids, prop.arg)
            }

            // 特殊处理v-for指令
            if (prop.name === 'for') {
              extractIdentifiers(ids, prop.forParseResult!.source)
            } else if (prop.exp) {
              // 提取指令表达式中的标识符
              extractIdentifiers(ids, prop.exp)
            } else if (prop.name === 'bind' && !prop.exp) {
              // 处理v-bind简写形式的属性名
              ids.add(camelize((prop.arg as SimpleExpressionNode).content))
            }
          }
          // 处理ref属性
          if (
            prop.type === NodeTypes.ATTRIBUTE &&
            prop.name === 'ref' &&
            prop.value?.content
          ) {
            ids.add(prop.value.content)
          }
        }
        // 递归处理子节点
        node.children.forEach(walk)
        break
      case NodeTypes.INTERPOLATION:
        // 提取插值表达式中的标识符
        extractIdentifiers(ids, node.content)
        break
    }
  }

  // 缓存结果
  templateUsageCheckCache.set(content, ids)
  return ids
}

/**
 * 从表达式节点中提取标识符
 * @param ids - 存储标识符的集合
 * @param node - 表达式节点
 */
function extractIdentifiers(ids: Set<string>, node: ExpressionNode) {
  if (node.ast) {
    // 如果节点有AST，遍历所有标识符
    walkIdentifiers(node.ast, n => ids.add(n.name))
  } else if (node.ast === null) {
    // 如果是简单表达式，直接添加内容
    ids.add((node as SimpleExpressionNode).content)
  }
}
