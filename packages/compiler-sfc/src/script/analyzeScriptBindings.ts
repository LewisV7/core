/**
 * Vue单文件组件脚本绑定分析模块
 * 该模块用于分析Vue SFC中普通`<script>`标签内的绑定关系
 */
import type {
  ArrayExpression,
  Node,
  ObjectExpression,
  Statement,
} from '@babel/types'
import { type BindingMetadata, BindingTypes } from '@vue/compiler-dom'
import { resolveObjectKey } from './utils'

/**
 * 分析普通`<script>`标签中的绑定
 * 注意：`compileScriptSetup`已经在其编译过程中分析了绑定，因此此函数只应用于单`<script>`的SFC
 * @param {Statement[]} ast - 抽象语法树
 * @returns {BindingMetadata} 绑定元数据
 */
export function analyzeScriptBindings(ast: Statement[]): BindingMetadata {
  for (const node of ast) {
    if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration.type === 'ObjectExpression'
    ) {
      return analyzeBindingsFromOptions(node.declaration)
    }
  }
  return {}
}

/**
 * 从选项对象中分析绑定
 * @param {ObjectExpression} node - 对象表达式节点
 * @returns {BindingMetadata} 绑定元数据
 */
function analyzeBindingsFromOptions(node: ObjectExpression): BindingMetadata {
  const bindings: BindingMetadata = {}
  // #3270, #3275
  // mark non-script-setup so we don't resolve components/directives from these
  Object.defineProperty(bindings, '__isScriptSetup', {
    enumerable: false,
    value: false,
  })
  for (const property of node.properties) {
    if (
      property.type === 'ObjectProperty' &&
      !property.computed &&
      property.key.type === 'Identifier'
    ) {
      // props
      if (property.key.name === 'props') {
        // props: ['foo']
        // props: { foo: ... }
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.PROPS
        }
      }

      // inject
      else if (property.key.name === 'inject') {
        // inject: ['foo']
        // inject: { foo: {} }
        for (const key of getObjectOrArrayExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }

      // computed & methods
      else if (
        property.value.type === 'ObjectExpression' &&
        (property.key.name === 'computed' || property.key.name === 'methods')
      ) {
        // methods: { foo() {} }
        // computed: { foo() {} }
        for (const key of getObjectExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }
    }

    // setup & data
    else if (
      property.type === 'ObjectMethod' &&
      property.key.type === 'Identifier' &&
      (property.key.name === 'setup' || property.key.name === 'data')
    ) {
      for (const bodyItem of property.body.body) {
        // setup() {
        //   return {
        //     foo: null
        //   }
        // }
        if (
          bodyItem.type === 'ReturnStatement' &&
          bodyItem.argument &&
          bodyItem.argument.type === 'ObjectExpression'
        ) {
          for (const key of getObjectExpressionKeys(bodyItem.argument)) {
            bindings[key] =
              property.key.name === 'setup'
                ? BindingTypes.SETUP_MAYBE_REF
                : BindingTypes.DATA
          }
        }
      }
    }
  }

  return bindings
}

/**
 * 获取对象表达式的键
 * @param {ObjectExpression} node - 对象表达式节点
 * @returns {string[]} 键名数组
 */
function getObjectExpressionKeys(node: ObjectExpression): string[] {
  const keys = []
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') continue
    const key = resolveObjectKey(prop.key, prop.computed)
    if (key) keys.push(String(key))
  }
  return keys
}

/**
 * 获取数组表达式的键
 * @param {ArrayExpression} node - 数组表达式节点
 * @returns {string[]} 键名数组
 */
function getArrayExpressionKeys(node: ArrayExpression): string[] {
  const keys = []
  for (const element of node.elements) {
    if (element && element.type === 'StringLiteral') {
      keys.push(element.value)
    }
  }
  return keys
}

/**
 * 根据节点类型获取对象或数组表达式的键
 * @param {Node} value - 节点
 * @returns {string[]} 键名数组
 */
export function getObjectOrArrayExpressionKeys(value: Node): string[] {
  if (value.type === 'ArrayExpression') {
    return getArrayExpressionKeys(value)
  }
  if (value.type === 'ObjectExpression') {
    return getObjectExpressionKeys(value)
  }
  return []
}
