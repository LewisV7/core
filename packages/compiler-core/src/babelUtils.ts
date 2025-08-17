/**
 * Babel AST 工具函数
 * 此文件提供了用于处理 Babel AST 的实用工具函数
 * 注意：此文件只应使用 @babel/types 中的类型，不应导入运行时方法
 */

// 仅从 @babel/types 导入类型
// 不要导入运行时方法
import type {
  BlockStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Function,
  Identifier,
  Node,
  ObjectProperty,
  Program,
} from '@babel/types'
import { walk } from 'estree-walker'

/**
 * 遍历 AST 中的标识符节点
 * 此函数用于遍历 AST 并对每个标识符节点调用提供的回调函数
 * @param root - 要遍历的根节点
 * @param onIdentifier - 处理标识符节点的回调函数
 * @param includeAll - 是否包含所有标识符（包括局部变量）
 * @param parentStack - 父节点栈，用于跟踪节点层次结构
 * @param knownIds - 已知标识符映射，用于跟踪局部变量
 */
export function walkIdentifiers(
  root: Node,
  onIdentifier: (
    node: Identifier,
    parent: Node | null,
    parentStack: Node[],
    isReference: boolean,
    isLocal: boolean,
  ) => void,
  includeAll = false,
  parentStack: Node[] = [],
  knownIds: Record<string, number> = Object.create(null),
): void {
  // 在浏览器环境中不执行
  if (__BROWSER__) {
    return
  }

  // 获取根表达式节点
  const rootExp =
    root.type === 'Program'
      ? root.body[0].type === 'ExpressionStatement' && root.body[0].expression
      : root

  // 使用 estree-walker 遍历 AST
  walk(root, {
    enter(node: Node & { scopeIds?: Set<string> }, parent: Node | null) {
      // 将父节点添加到栈中
      parent && parentStack.push(parent)
      // 跳过特定的 TypeScript 节点
      if (
        parent &&
        parent.type.startsWith('TS') &&
        !TS_NODE_TYPES.includes(parent.type)
      ) {
        return this.skip()
      }
      // 处理标识符节点
      if (node.type === 'Identifier') {
        const isLocal = !!knownIds[node.name] // 是否为局部变量
        const isRefed = isReferencedIdentifier(node, parent, parentStack) // 是否为引用
        // 如果包含所有标识符或当前是引用且不是局部变量，则调用回调
        if (includeAll || (isRefed && !isLocal)) {
          onIdentifier(node, parent, parentStack, isRefed, isLocal)
        }
      } else if (
        node.type === 'ObjectProperty' &&
        // eslint-disable-next-line no-restricted-syntax
        parent?.type === 'ObjectPattern'
      ) {
        // 标记解构模式中的属性
        ;(node as any).inPattern = true
      } else if (isFunctionType(node)) {
        // 处理函数类型节点
        if (node.scopeIds) {
          node.scopeIds.forEach(id => markKnownIds(id, knownIds))
        } else {
          // 遍历函数参数并添加到已知标识符中
          // 这样我们就不会为它们添加前缀
          walkFunctionParams(node, id =>
            markScopeIdentifier(node, id, knownIds),
          )
        }
      } else if (node.type === 'BlockStatement') {
        // 处理块语句
        if (node.scopeIds) {
          node.scopeIds.forEach(id => markKnownIds(id, knownIds))
        } else {
          // #3445 记录块级局部变量
          walkBlockDeclarations(node, id =>
            markScopeIdentifier(node, id, knownIds),
          )
        }
      } else if (node.type === 'CatchClause' && node.param) {
        // 处理 catch 子句中的参数
        for (const id of extractIdentifiers(node.param)) {
          markScopeIdentifier(node, id, knownIds)
        }
      } else if (isForStatement(node)) {
        // 处理 for 语句
        walkForStatement(node, false, id =>
          markScopeIdentifier(node, id, knownIds),
        )
      }
    },
    leave(node: Node & { scopeIds?: Set<string> }, parent: Node | null) {
      // 从栈中移除父节点
      parent && parentStack.pop()
      // 如果不是根表达式且有作用域 ID，则更新已知标识符
      if (node !== rootExp && node.scopeIds) {
        for (const id of node.scopeIds) {
          knownIds[id]--
          if (knownIds[id] === 0) {
            delete knownIds[id]
          }
        }
      }
    },
  })
}

/**
 * 判断标识符是否被引用
 * 此函数用于确定给定的标识符节点是否在代码中被引用
 * @param id - 要检查的标识符节点
 * @param parent - 标识符的父节点
 * @param parentStack - 父节点栈，用于跟踪节点层次结构
 * @returns 标识符是否被引用
 */
export function isReferencedIdentifier(
  id: Identifier,
  parent: Node | null,
  parentStack: Node[],
): boolean {
  // 在浏览器环境中不执行
  if (__BROWSER__) {
    return false
  }

  // 如果没有父节点，则视为被引用
  if (!parent) {
    return true
  }

  // 'arguments' 是特殊关键字，虽然被解析为标识符，但不视为引用
  if (id.name === 'arguments') {
    return false
  }

  // 使用 Babel 的 isReferenced 函数检查是否被引用
  if (isReferenced(id, parent, parentStack[parentStack.length - 2])) {
    return true
  }

  // Babel 的 isReferenced 检查对于被赋值的标识符返回 false，因此我们需要在此处覆盖这些情况
  switch (parent.type) {
    case 'AssignmentExpression': // 赋值表达式
    case 'AssignmentPattern':   // 赋值模式
      return true
    case 'ObjectProperty':      // 对象属性
      return parent.key !== id && isInDestructureAssignment(parent, parentStack)
    case 'ArrayPattern':        // 数组模式
      return isInDestructureAssignment(parent, parentStack)
  }

  return false
}

/**
 * 判断节点是否在解构赋值中
 * @param parent - 要检查的节点
 * @param parentStack - 父节点栈，用于跟踪节点层次结构
 * @returns 是否在解构赋值中
 */
export function isInDestructureAssignment(
  parent: Node,
  parentStack: Node[],
): boolean {
  // 检查是否为对象属性或数组模式
  if (
    parent &&
    (parent.type === 'ObjectProperty' || parent.type === 'ArrayPattern')
  ) {
    // 遍历父节点栈，检查是否存在赋值表达式
    let i = parentStack.length
    while (i--) {
      const p = parentStack[i]
      if (p.type === 'AssignmentExpression') {
        return true
      } else if (p.type !== 'ObjectProperty' && !p.type.endsWith('Pattern')) {
        break
      }
    }
  }
  return false
}

/**
 * 判断节点是否在 New 表达式中
 * @param parentStack - 父节点栈，用于跟踪节点层次结构
 * @returns 是否在 New 表达式中
 */
export function isInNewExpression(parentStack: Node[]): boolean {
  // 遍历父节点栈，检查是否存在 NewExpression
  let i = parentStack.length
  while (i--) {
    const p = parentStack[i]
    if (p.type === 'NewExpression') {
      return true
    } else if (p.type !== 'MemberExpression') {
      break
    }
  }
  return false
}

/**
 * 遍历函数参数
 * 此函数用于遍历函数的所有参数，并对每个参数中的标识符调用提供的回调函数
 * @param node - 函数节点
 * @param onIdent - 处理标识符的回调函数
 */
export function walkFunctionParams(
  node: Function,
  onIdent: (id: Identifier) => void,
): void {
  // 遍历所有参数
  for (const p of node.params) {
    // 提取参数中的所有标识符并调用回调
    for (const id of extractIdentifiers(p)) {
      onIdent(id)
    }
  }
}

/**
 * 遍历块级声明
 * 此函数用于遍历块语句或程序中的所有声明，并对每个声明中的标识符调用提供的回调函数
 * @param block - 块语句或程序节点
 * @param onIdent - 处理标识符的回调函数
 */
export function walkBlockDeclarations(
  block: BlockStatement | Program,
  onIdent: (node: Identifier) => void,
): void {
  // 遍历块中的所有语句
  for (const stmt of block.body) {
    // 处理变量声明
    if (stmt.type === 'VariableDeclaration') {
      if (stmt.declare) continue // 跳过declare声明
      for (const decl of stmt.declarations) {
        // 提取声明中的所有标识符并调用回调
        for (const id of extractIdentifiers(decl.id)) {
          onIdent(id)
        }
      }
    } else if (
      stmt.type === 'FunctionDeclaration' || // 函数声明
      stmt.type === 'ClassDeclaration'       // 类声明
    ) {
      if (stmt.declare || !stmt.id) continue // 跳过declare声明或无标识符的声明
      onIdent(stmt.id) // 处理声明的标识符
    } else if (isForStatement(stmt)) {
      // 处理for语句
      walkForStatement(stmt, true, onIdent)
    }
  }
}

/**
 * 判断是否为for语句
 * @param stmt - 要检查的语句节点
 * @returns 是否为for语句（ForStatement、ForOfStatement或ForInStatement）
 */
function isForStatement(
  stmt: Node,
): stmt is ForStatement | ForOfStatement | ForInStatement {
  return (
    stmt.type === 'ForOfStatement' ||
    stmt.type === 'ForInStatement' ||
    stmt.type === 'ForStatement'
  )
}

function walkForStatement(
  stmt: ForStatement | ForOfStatement | ForInStatement,
  isVar: boolean,
  onIdent: (id: Identifier) => void,
) {
  const variable = stmt.type === 'ForStatement' ? stmt.init : stmt.left
  if (
    variable &&
    variable.type === 'VariableDeclaration' &&
    (variable.kind === 'var' ? isVar : !isVar)
  ) {
    // 遍历所有变量声明
    for (const decl of variable.declarations) {
      // 提取声明中的所有标识符并调用回调
      for (const id of extractIdentifiers(decl.id)) {
        onIdent(id)
      }
    }
  }
}

/**
 * 提取标识符
 * 此函数用于从节点中提取所有标识符
 * @param param - 要提取标识符的节点
 * @param nodes - 用于存储提取的标识符的数组
 * @returns 包含提取的标识符的数组
 */
export function extractIdentifiers(
  param: Node,
  nodes: Identifier[] = [],
): Identifier[] {
  // 根据节点类型提取标识符
  switch (param.type) {
    case 'Identifier':
      nodes.push(param)
      break

    case 'MemberExpression':
      let object: any = param
      while (object.type === 'MemberExpression') {
        object = object.object
      }
      nodes.push(object)
      break

    case 'ObjectPattern':
      for (const prop of param.properties) {
        if (prop.type === 'RestElement') {
          extractIdentifiers(prop.argument, nodes)
        } else {
          extractIdentifiers(prop.value, nodes)
        }
      }
      break

    case 'ArrayPattern':
      param.elements.forEach(element => {
        if (element) extractIdentifiers(element, nodes)
      })
      break

    case 'RestElement':
      extractIdentifiers(param.argument, nodes)
      break

    case 'AssignmentPattern':
      extractIdentifiers(param.left, nodes)
      break
  }

  return nodes
}

/**
 * 标记已知标识符
 * 此函数用于在已知标识符映射中标记标识符
 * @param name - 标识符名称
 * @param knownIds - 已知标识符映射
 */
function markKnownIds(name: string, knownIds: Record<string, number>) {
  if (name in knownIds) {
    knownIds[name]++ // 增加标识符计数
  } else {
    knownIds[name] = 1 // 初始化为1
  }
}

/**
 * 标记作用域标识符
 * 此函数用于在节点的作用域中标记标识符
 * @param node - 节点
 * @param child - 标识符节点
 * @param knownIds - 已知标识符映射
 */
function markScopeIdentifier(
  node: Node & { scopeIds?: Set<string> },
  child: Identifier,
  knownIds: Record<string, number>,
) {
  const { name } = child
  // 如果标识符已经在作用域中，则直接返回
  if (node.scopeIds && node.scopeIds.has(name)) {
    return
  }
  // 标记已知标识符并添加到作用域
  markKnownIds(name, knownIds)
  ;(node.scopeIds || (node.scopeIds = new Set())).add(name)
}

/**
 * 判断是否为函数类型
 * @param node - 要检查的节点
 * @returns 是否为函数类型
 */
export const isFunctionType = (node: Node): node is Function => {
  // 使用正则表达式检查节点类型是否为函数相关类型
  return /Function(?:Expression|Declaration)$|Method$/.test(node.type)
}

/**
 * 判断是否为静态属性
 * @param node - 要检查的节点
 * @returns 是否为静态属性
 */
export const isStaticProperty = (node: Node): node is ObjectProperty =>
  node &&
  (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') &&
  !node.computed

/**
 * 判断是否为静态属性的键
 * @param node - 要检查的节点
 * @param parent - 父节点
 * @returns 是否为静态属性的键
 */
export const isStaticPropertyKey = (node: Node, parent: Node): boolean =>
  isStaticProperty(parent) && parent.key === node

/**
 * 判断节点是否被引用
 * 此函数从 Babel 源码复制而来，用于避免对 @babel/types 的运行时依赖
 * (因为 @babel/types 包含 process 引用)
 * Babel 中的此文件通常不会频繁更改，但我们可能需要不时地保持其更新
 *
 * 来源: https://github.com/babel/babel/blob/main/packages/babel-types/src/validators/isReferenced.ts
 * 许可证: https://github.com/babel/babel/blob/main/LICENSE
 *
 * @param node - 要检查的节点
 * @param parent - 父节点
 * @param grandparent - 祖父节点（可选）
 * @returns 节点是否被引用
 */
function isReferenced(node: Node, parent: Node, grandparent?: Node): boolean {
  switch (parent.type) {
    // 成员表达式处理
    // yes: PARENT[NODE] (计算属性)
    // yes: NODE.child (对象的子属性)
    // no: parent.NODE (属性名称)
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      if (parent.property === node) {
        // 如果是属性且是计算属性，则被引用
        return !!parent.computed
      }
      // 如果是对象部分，则被引用
      return parent.object === node

    // JSX成员表达式
    case 'JSXMemberExpression':
      return parent.object === node
    // 变量声明
    // no: let NODE = init; (变量名)
    // yes: let id = NODE; (初始化值)
    case 'VariableDeclarator':
      return parent.init === node

    // 箭头函数表达式
    // yes: () => NODE (函数体)
    // no: (NODE) => {} (参数)
    case 'ArrowFunctionExpression':
      return parent.body === node

    // 私有名称
    // no: class { #NODE; } (私有字段)
    // no: class { get #NODE() {} } (私有getter)
    // no: class { #NODE() {} } (私有方法)
    // no: class { fn() { return this.#NODE; } } (私有字段引用)
    case 'PrivateName':
      return false

    // 类方法和对象方法
    // no: class { NODE() {} } (方法名)
    // yes: class { [NODE]() {} } (计算方法名)
    // no: class { foo(NODE) {} } (参数)
    case 'ClassMethod':
    case 'ClassPrivateMethod':
    case 'ObjectMethod':
      if (parent.key === node) {
        return !!parent.computed
      }
      return false

    // 对象属性
    // yes: { [NODE]: "" } (计算属性名)
    // no: { NODE: "" } (属性名)
    // depends: { NODE } (属性简写)
    // depends: { key: NODE } (属性值)
    case 'ObjectProperty':
      if (parent.key === node) {
        return !!parent.computed
      }
      // parent.value === node
      return !grandparent || grandparent.type !== 'ObjectPattern'
    // 类属性
    // no: class { NODE = value; } (属性名)
    // yes: class { [NODE] = value; } (计算属性名)
    // yes: class { key = NODE; } (属性值)
    case 'ClassProperty':
      if (parent.key === node) {
        return !!parent.computed
      }
      return true
    // 私有类属性
    case 'ClassPrivateProperty':
      return parent.key !== node

    // 类声明和表达式
    // no: class NODE {} (类名)
    // yes: class Foo extends NODE {} (继承的类)
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.superClass === node

    // 赋值表达式
    // yes: left = NODE; (右侧值)
    // no: NODE = right; (左侧变量)
    case 'AssignmentExpression':
      return parent.right === node

    // 赋值模式
    // no: [NODE = foo] = []; (左侧变量)
    // yes: [foo = NODE] = []; (右侧值)
    case 'AssignmentPattern':
      return parent.right === node

    // 标签语句
    // no: NODE: for (;;) {} (标签名)
    case 'LabeledStatement':
      return false

    // catch子句
    // no: try {} catch (NODE) {} (异常变量)
    case 'CatchClause':
      return false

    // 剩余元素
    // no: function foo(...NODE) {} (剩余参数)
    case 'RestElement':
      return false

    // break和continue语句
    case 'BreakStatement':
    case 'ContinueStatement':
      return false

    // 函数声明和表达式
    // no: function NODE() {} (函数名)
    // no: function foo(NODE) {} (参数)
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return false

    // 导出命名空间和默认导出
    // no: export NODE from "foo"; (导出的绑定)
    // no: export * as NODE from "foo"; (命名空间导出)
    case 'ExportNamespaceSpecifier':
    case 'ExportDefaultSpecifier':
      return false

    // 导出说明符
    // no: export { foo as NODE }; (别名)
    // yes: export { NODE as foo }; (原始名称)
    // no: export { NODE as foo } from "foo"; (来自其他模块的导出)
    case 'ExportSpecifier':
      // @ts-expect-error
      // eslint-disable-next-line no-restricted-syntax
      if (grandparent?.source) {
        return false
      }
      return parent.local === node

    // 导入说明符
    // no: import NODE from "foo"; (默认导入)
    // no: import * as NODE from "foo"; (命名空间导入)
    // no: import { NODE as foo } from "foo"; (具名导入)
    // no: import { foo as NODE } from "foo"; (别名导入)
    // no: import NODE from "bar"; (默认导入)
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ImportSpecifier':
      return false

    // 导入属性
    // no: import "foo" assert { NODE: "json" } (属性名)
    case 'ImportAttribute':
      return false

    // JSX属性
    // no: <div NODE="foo" /> (属性名)
    case 'JSXAttribute':
      return false

    // 对象和数组模式
    // no: [NODE] = []; (数组解构)
    // no: ({ NODE }) = []; (对象解构)
    case 'ObjectPattern':
    case 'ArrayPattern':
      return false

    // 元属性
    // no: new.NODE
    // no: NODE.target
    case 'MetaProperty':
      return false

    // 对象类型属性
    // yes: type X = { someProperty: NODE } (属性类型)
    // no: type X = { NODE: OtherType } (属性名)
    case 'ObjectTypeProperty':
      return parent.key !== node

    // TS枚举成员
    // yes: enum X { Foo = NODE } (枚举值)
    // no: enum X { NODE } (枚举名)
    case 'TSEnumMember':
      return parent.id !== node

    // TS属性签名
    // yes: { [NODE]: value } (计算属性名)
    // no: { NODE: value } (属性名)
    case 'TSPropertySignature':
      if (parent.key === node) {
        return !!parent.computed
      }

      return true
  }

  return true
}

/**
 * TypeScript 节点类型列表
 * 包含需要特殊处理的 TypeScript 语法节点类型
 */
export const TS_NODE_TYPES: string[] = [
  'TSAsExpression', // foo as number (类型断言)
  'TSTypeAssertion', // (<number>foo) (类型断言)
  'TSNonNullExpression', // foo! (非空断言)
  'TSInstantiationExpression', // foo<string> (泛型实例化)
  'TSSatisfiesExpression', // foo satisfies T (satisfies 表达式)
]

/**
 * 解包 TypeScript 节点
 * 此函数用于移除 TypeScript 语法节点包装，返回原始节点
 * @param node - 要解包的节点
 * @returns 解包后的原始节点
 */
export function unwrapTSNode(node: Node): Node {
  // 如果是 TypeScript 节点类型，则递归解包
  if (TS_NODE_TYPES.includes(node.type)) {
    return unwrapTSNode((node as any).expression)
  } else {
    return node
  }
}
