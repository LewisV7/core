/**
 * TypeScript 类型解析器
 * 该模块负责解析和推断 TypeScript 类型，为 Vue 单文件组件的脚本部分提供类型支持。
 * 主要功能包括：
 * - 解析接口、类型字面量、联合类型、交叉类型等
 * - 处理映射类型和索引类型
 * - 解析类型引用和内置工具类型
 * - 推断运行时类型
 */
// 导入 Babel AST 节点类型
import type {
  Expression,
  Identifier,
  Node,
  Statement,
  TSCallSignatureDeclaration,
  TSEnumDeclaration,
  TSExpressionWithTypeArguments,
  TSFunctionType,
  TSImportType,
  TSIndexedAccessType,
  TSInterfaceDeclaration,
  TSMappedType,
  TSMethodSignature,
  TSModuleBlock,
  TSModuleDeclaration,
  TSPropertySignature,
  TSQualifiedName,
  TSType,
  TSTypeAnnotation,
  TSTypeElement,
  TSTypeLiteral,
  TSTypeQuery,
  TSTypeReference,
  TemplateLiteral,
} from '@babel/types'

// 导入工具函数和常量
import {
  UNKNOWN_TYPE, // 表示未知类型的常量
  createGetCanonicalFileName, // 创建获取规范文件名的函数
  getId, // 获取节点 ID
  getImportedName, // 获取导入名称
  joinPaths, // 连接路径
  normalizePath, // 标准化路径
} from './utils'

// 导入上下文相关函数和类型
import { type ScriptCompileContext, resolveParserPlugins } from './context'

// 导入编译脚本相关类型
import type { ImportBinding, SFCScriptCompileOptions } from '../compileScript'

// 导入共享工具函数
import { capitalize, hasOwn } from '@vue/shared'

// 导入解析器
import { parse as babelParse } from '@babel/parser'
import { parse } from '../parse'

// 导入缓存工具
import { createCache } from '../cache'

// 导入 TypeScript 类型
import type TS from 'typescript'

// 导入路径处理工具
import { dirname, extname, join } from 'path'

// 导入匹配工具
import { minimatch as isMatch } from 'minimatch'

// 导入进程模块
import * as process from 'process'

/**
 * 简化的类型解析选项
 * 从 SFCScriptCompileOptions 中挑选的部分属性，用于类型解析
 */
export type SimpleTypeResolveOptions = Partial<
  Pick<
    SFCScriptCompileOptions,
    'globalTypeFiles' | 'fs' | 'babelParserPlugins' | 'isProd'
  >
>

/**
 * 类型解析上下文
 * 与 ScriptCompileContext 兼容，但也允许在非 SFC 上下文中使用更简单的版本
 * 最简单的上下文只需包含 filename、source、options、error 和 ast 属性
 * 
 * 示例:
 * ```ts
 * const ctx: SimpleTypeResolveContext = {
 *   filename: '...',
 *   source: '...',
 *   options: {},
 *   error() {},
 *   ast: []
 * }
 * ```
 */
/**
 * 简单类型解析上下文
 * 包含类型解析所需的基本属性
 * 从 ScriptCompileContext 中挑选了必要的属性，并添加了额外的 ast 和 options 属性
 */
export type SimpleTypeResolveContext = Pick<
  ScriptCompileContext,
  // 文件相关
  | 'source'
  | 'filename'

  // 工具函数
  | 'error'
  | 'helper'
  | 'getString'

  // Props 相关
  | 'propsTypeDecl'
  | 'propsRuntimeDefaults'
  | 'propsDestructuredBindings'

  // Emits 相关
  | 'emitsTypeDecl'

  // 自定义元素相关
  | 'isCE'
> &
  Partial<
    Pick<ScriptCompileContext, 'scope' | 'globalScopes' | 'deps' | 'fs'>
  > & {
    ast: Statement[]
    options: SimpleTypeResolveOptions
  }

/**
 * 类型解析上下文
 * 可以是完整的 ScriptCompileContext 或简化的 SimpleTypeResolveContext
 */
export type TypeResolveContext = ScriptCompileContext | SimpleTypeResolveContext

/**
 * 导入信息
 * 从 ImportBinding 中挑选的部分属性，包含导入源和导入的名称
 */
type Import = Pick<ImportBinding, 'source' | 'imported'>

interface WithScope {
  _ownerScope: TypeScope
}

// scope types always has ownerScope attached
type ScopeTypeNode = Node &
  WithScope & { _ns?: TSModuleDeclaration & WithScope }

/**
 * 类型作用域类
 * 表示一个代码块中的类型作用域，包含该作用域内的导入、类型声明和变量声明等信息
 */
export class TypeScope {
  constructor(
    public filename: string, // 文件名称
    public source: string, // 文件源代码
    public offset: number = 0, // 偏移量
    public imports: Record<string, Import> = Object.create(null), // 导入信息
    public types: Record<string, ScopeTypeNode> = Object.create(null), // 类型声明
    public declares: Record<string, ScopeTypeNode> = Object.create(null), // 声明的类型
  ) {}
  isGenericScope = false // 是否为泛型作用域
  resolvedImportSources: Record<string, string> = Object.create(null) // 已解析的导入源
  exportedTypes: Record<string, ScopeTypeNode> = Object.create(null) // 导出的类型
  exportedDeclares: Record<string, ScopeTypeNode> = Object.create(null) // 导出的声明
}

/**
 * 可能带有作用域的接口
 * 表示一个可能具有所属作用域的节点
 */
export interface MaybeWithScope {
  _ownerScope?: TypeScope // 所属作用域
}

/**
 * 解析后的元素
 * 包含解析后的属性和调用签名
 */
interface ResolvedElements {
  props: Record<
    string,
    (TSPropertySignature | TSMethodSignature) & {
      // 解析后的属性总是带有所属作用域
      _ownerScope: TypeScope
    }
  > // 属性记录
  calls?: (TSCallSignatureDeclaration | TSFunctionType)[] // 调用签名数组
}

/**
 * 解析任意类型节点为类型元素列表
 * 将类型节点解析为可映射到运行时props或emits的类型元素列表
 * @param ctx 类型解析上下文
 * @param node 要解析的类型节点
 * @param scope 可选的作用域
 * @param typeParameters 可选的类型参数
 * @returns 解析后的元素，包含props和calls
 */
export function resolveTypeElements(
  ctx: TypeResolveContext,
  node: Node & MaybeWithScope & { _resolvedElements?: ResolvedElements },
  scope?: TypeScope,
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  const canCache = !typeParameters
  if (canCache && node._resolvedElements) {
    return node._resolvedElements
  }
  const resolved = innerResolveTypeElements(
    ctx,
    node,
    node._ownerScope || scope || ctxToScope(ctx),
    typeParameters,
  )
  return canCache ? (node._resolvedElements = resolved) : resolved
}

/**
 * 内部类型元素解析函数
 * resolveTypeElements的内部实现，负责实际的类型解析逻辑
 * @param ctx 类型解析上下文
 * @param node 要解析的类型节点
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析后的元素
 */
function innerResolveTypeElements(
  ctx: TypeResolveContext,
  node: Node,
  scope: TypeScope,
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  // 如果节点有@vue-ignore注释，则忽略该节点
  if (
    node.leadingComments &&
    node.leadingComments.some(c => c.value.includes('@vue-ignore'))
  ) {
    return { props: {} }
  }
  // 根据节点类型进行不同的解析
  switch (node.type) {
    case 'TSTypeLiteral':
      return typeElementsToMap(ctx, node.members, scope, typeParameters)
    case 'TSInterfaceDeclaration':
      return resolveInterfaceMembers(ctx, node, scope, typeParameters)
    case 'TSTypeAliasDeclaration':
    case 'TSTypeAnnotation':
    case 'TSParenthesizedType':
      return resolveTypeElements(
        ctx,
        node.typeAnnotation,
        scope,
        typeParameters,
      )
    case 'TSFunctionType': {
      return { props: {}, calls: [node] }
    }
    case 'TSUnionType':
    case 'TSIntersectionType':
      return mergeElements(
        node.types.map(t => resolveTypeElements(ctx, t, scope, typeParameters)),
        node.type,
      )
    case 'TSMappedType':
      return resolveMappedType(ctx, node, scope, typeParameters)
    case 'TSIndexedAccessType': {
      const types = resolveIndexType(ctx, node, scope)
      return mergeElements(
        types.map(t => resolveTypeElements(ctx, t, t._ownerScope)),
        'TSUnionType',
      )
    }
    case 'TSExpressionWithTypeArguments': // 被接口继承引用
    case 'TSTypeReference': {
      const typeName = getReferenceName(node)
      // 处理ExtractPropTypes和ExtractPublicPropTypes特殊情况
      if (
        (typeName === 'ExtractPropTypes' ||
          typeName === 'ExtractPublicPropTypes') &&
        node.typeParameters &&
        scope.imports[typeName]?.source === 'vue'
      ) {
        return resolveExtractPropTypes(
          resolveTypeElements(
            ctx,
            node.typeParameters.params[0],
            scope,
            typeParameters,
          ),
          scope,
        )
      }
      const resolved = resolveTypeReference(ctx, node, scope)
      if (resolved) {
        let typeParams: Record<string, Node> | undefined
        if (
          (resolved.type === 'TSTypeAliasDeclaration' ||
            resolved.type === 'TSInterfaceDeclaration') &&
          resolved.typeParameters &&
          node.typeParameters
        ) {
          typeParams = Object.create(null)
          resolved.typeParameters.params.forEach((p, i) => {
            let param = typeParameters && typeParameters[p.name]
            if (!param) param = node.typeParameters!.params[i]
            typeParams![p.name] = param
          })
        }
        return resolveTypeElements(
          ctx,
          resolved,
          resolved._ownerScope,
          typeParams,
        )
      } else {
        if (typeof typeName === 'string') {
          if (typeParameters && typeParameters[typeName]) {
            return resolveTypeElements(
              ctx,
              typeParameters[typeName],
              scope,
              typeParameters,
            )
          }
          if (
            // @ts-expect-error
            SupportedBuiltinsSet.has(typeName)
          ) {
            return resolveBuiltin(
              ctx,
              node,
              typeName as any,
              scope,
              typeParameters,
            )
          } else if (typeName === 'ReturnType' && node.typeParameters) {
            // limited support, only reference types
            const ret = resolveReturnType(
              ctx,
              node.typeParameters.params[0],
              scope,
            )
            if (ret) {
              return resolveTypeElements(ctx, ret, scope)
            }
          }
        }
        return ctx.error(
          `Unresolvable type reference or unsupported built-in utility type`,
          node,
          scope,
        )
      }
    }
    case 'TSImportType': {
      if (
        getId(node.argument) === 'vue' &&
        node.qualifier?.type === 'Identifier' &&
        node.qualifier.name === 'ExtractPropTypes' &&
        node.typeParameters
      ) {
        return resolveExtractPropTypes(
          resolveTypeElements(ctx, node.typeParameters.params[0], scope),
          scope,
        )
      }
      const sourceScope = importSourceToScope(
        ctx,
        node.argument,
        scope,
        node.argument.value,
      )
      const resolved = resolveTypeReference(ctx, node, sourceScope)
      if (resolved) {
        return resolveTypeElements(ctx, resolved, resolved._ownerScope)
      }
      break
    }
    case 'TSTypeQuery':
      {
        const resolved = resolveTypeReference(ctx, node, scope)
        if (resolved) {
          return resolveTypeElements(ctx, resolved, resolved._ownerScope)
        }
      }
      break
  }
  return ctx.error(`Unresolvable type: ${node.type}`, node, scope)
}

/**
 * 将类型元素映射到ResolvedElements
 * 将类型字面量的成员转换为可用于运行时的属性和调用签名
 * @param ctx 类型解析上下文
 * @param elements 类型元素数组
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析后的元素
 */
function typeElementsToMap(
  ctx: TypeResolveContext,
  elements: TSTypeElement[],
  scope = ctxToScope(ctx),
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  const res: ResolvedElements = { props: {} }
  for (const e of elements) {
    if (e.type === 'TSPropertySignature' || e.type === 'TSMethodSignature') {
      // 捕获节点作用域上的泛型参数
      if (typeParameters) {
        scope = createChildScope(scope)
        scope.isGenericScope = true
        Object.assign(scope.types, typeParameters)
      }
      ;(e as MaybeWithScope)._ownerScope = scope
      const name = getId(e.key)
      if (name && !e.computed) {
        res.props[name] = e as ResolvedElements['props'][string]
      } else if (e.key.type === 'TemplateLiteral') {
        for (const key of resolveTemplateKeys(ctx, e.key, scope)) {
          res.props[key] = e as ResolvedElements['props'][string]
        }
      } else {
        ctx.error(
          `宏引用的类型中不支持计算属性名`,
          e.key,
          scope,
        )
      }
    } else if (e.type === 'TSCallSignatureDeclaration') {
      ;(res.calls || (res.calls = [])).push(e)
    }
  }
  return res
}

/**
 * 合并多个ResolvedElements对象
 * 将多个类型解析结果合并为一个
 * @param maps 要合并的ResolvedElements数组
 * @param type 合并类型，可以是联合类型或交叉类型
 * @returns 合并后的ResolvedElements
 */
function mergeElements(
  maps: ResolvedElements[],
  type: 'TSUnionType' | 'TSIntersectionType',
): ResolvedElements {
  if (maps.length === 1) return maps[0]
  const res: ResolvedElements = { props: {} }
  const { props: baseProps } = res
  for (const { props, calls } of maps) {
    for (const key in props) {
      if (!hasOwn(baseProps, key)) {
        baseProps[key] = props[key]
      } else {
        baseProps[key] = createProperty(
          baseProps[key].key,
          {
            type,
            // @ts-expect-error
            types: [baseProps[key], props[key]],
          },
          baseProps[key]._ownerScope,
          baseProps[key].optional || props[key].optional,
        )
      }
    }
    if (calls) {
      ;(res.calls || (res.calls = [])).push(...calls)
    }
  }
  return res
}

/**
 * 创建属性签名
 * 创建一个带有类型注释的属性签名
 * @param key 属性键
 * @param typeAnnotation 类型注释
 * @param scope 作用域
 * @param optional 是否可选
 * @returns 创建的属性签名
 */
function createProperty(
  key: Expression,
  typeAnnotation: TSType,
  scope: TypeScope,
  optional: boolean,
): TSPropertySignature & WithScope {
  return {
    type: 'TSPropertySignature',
    key,
    kind: 'get',
    optional,
    typeAnnotation: {
      type: 'TSTypeAnnotation',
      typeAnnotation,
    },
    _ownerScope: scope,
  }
}

/**
 * 解析接口成员
 * 解析接口声明的成员，包括继承的成员
 * @param ctx 类型解析上下文
 * @param node 接口声明节点
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析后的元素
 */
function resolveInterfaceMembers(
  ctx: TypeResolveContext,
  node: TSInterfaceDeclaration & MaybeWithScope,
  scope: TypeScope,
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  const base = typeElementsToMap(
    ctx,
    node.body.body,
    node._ownerScope,
    typeParameters,
  )
  if (node.extends) {
    for (const ext of node.extends) {
      try {
        const { props, calls } = resolveTypeElements(ctx, ext, scope)
        for (const key in props) {
          if (!hasOwn(base.props, key)) {
            base.props[key] = props[key]
          }
        }
        if (calls) {
          ;(base.calls || (base.calls = [])).push(...calls)
        }
      } catch (e) {
        ctx.error(
          `无法解析继承的基类型。\n如果这在3.2版本中曾经工作，` +
            `你可以通过在它前面添加/* @vue-ignore */来指示编译器忽略此继承，例如：\n\n` +
            `interface Props extends /* @vue-ignore */ Base {}\n\n` +
            `注意：无论是在3.2版本中还是使用ignore，基类型中的属性在运行时都被视为fallthrough attrs。`,
          ext,
          scope,
        )
      }
    }
  }
  return base
}

/**
 * 解析映射类型
 * 解析TypeScript中的映射类型，将其转换为可映射到运行时props的类型元素
 * @param ctx 类型解析上下文
 * @param node 映射类型节点
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析后的元素
 */
function resolveMappedType(
  ctx: TypeResolveContext,
  node: TSMappedType,
  scope: TypeScope,
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  const res: ResolvedElements = { props: {} }
  let keys: string[]
  if (node.nameType) {
    const { name, constraint } = node.typeParameter
    scope = createChildScope(scope)
    Object.assign(scope.types, { ...typeParameters, [name]: constraint })
    keys = resolveStringType(ctx, node.nameType, scope)
  } else {
    keys = resolveStringType(ctx, node.typeParameter.constraint!, scope)
  }
  for (const key of keys) {
    res.props[key] = createProperty(
      { type: 'Identifier', name: key },
      node.typeAnnotation!,
      scope,
      !!node.optional,
    )
  }
  return res
}

/**
 * 解析索引类型
 * 解析TypeScript中的索引访问类型，例如 T[K]
 * @param ctx 类型解析上下文
 * @param node 索引访问类型节点
 * @param scope 作用域
 * @returns 解析后的类型数组
 */
function resolveIndexType(
  ctx: TypeResolveContext,
  node: TSIndexedAccessType,
  scope: TypeScope,
): (TSType & MaybeWithScope)[] {
  // 处理数组索引访问 (T[number])
  if (node.indexType.type === 'TSNumberKeyword') {
    return resolveArrayElementType(ctx, node.objectType, scope)
  }

  const { indexType, objectType } = node
  const types: TSType[] = []
  let keys: string[]
  let resolved: ResolvedElements
  // 处理字符串索引访问 (T[string])
  if (indexType.type === 'TSStringKeyword') {
    resolved = resolveTypeElements(ctx, objectType, scope)
    keys = Object.keys(resolved.props)
  } else {
    // 处理具体键索引访问 (T['key'])
    keys = resolveStringType(ctx, indexType, scope)
    resolved = resolveTypeElements(ctx, objectType, scope)
  }
  for (const key of keys) {
    const targetType = resolved.props[key]?.typeAnnotation?.typeAnnotation
    if (targetType) {
      ;(targetType as TSType & MaybeWithScope)._ownerScope =
        resolved.props[key]._ownerScope
      types.push(targetType)
    }
  }
  return types
}

/**
 * 解析数组元素类型
 * 从数组类型或类似数组的类型中解析元素类型
 * @param ctx 类型解析上下文
 * @param node 要解析的节点
 * @param scope 作用域
 * @returns 解析出的元素类型数组
 */
function resolveArrayElementType(
  ctx: TypeResolveContext,
  node: Node,
  scope: TypeScope,
): TSType[] {
  // 处理普通数组类型 (type[])
  if (node.type === 'TSArrayType') {
    return [node.elementType]
  }
  // 处理元组类型
  if (node.type === 'TSTupleType') {
    return node.elementTypes.map(t =>
      t.type === 'TSNamedTupleMember' ? t.elementType : t,
    )
  }
  if (node.type === 'TSTypeReference') {
    // 处理泛型数组类型 (Array<type>)
    if (getReferenceName(node) === 'Array' && node.typeParameters) {
      return node.typeParameters.params
    } else {
      const resolved = resolveTypeReference(ctx, node, scope)
      if (resolved) {
        return resolveArrayElementType(ctx, resolved, scope)
      }
    }
  }
  return ctx.error(
    '无法从目标类型解析元素类型',
    node,
    scope,
  )
}

/**
 * 解析字符串类型
 * 将类型解析为有限的字符串键集合
 * @param ctx 类型解析上下文
 * @param node 要解析的节点
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析出的字符串键数组
 */
function resolveStringType(
  ctx: TypeResolveContext,
  node: Node,
  scope: TypeScope,
  typeParameters?: Record<string, Node>,
): string[] {
  switch (node.type) {
    case 'StringLiteral':
      return [node.value]
    case 'TSLiteralType':
      return resolveStringType(ctx, node.literal, scope, typeParameters)
    case 'TSUnionType':
      return node.types
        .map(t => resolveStringType(ctx, t, scope, typeParameters))
        .flat()
    case 'TemplateLiteral': {
      return resolveTemplateKeys(ctx, node, scope)
    }
    case 'TSTypeReference': {
      const resolved = resolveTypeReference(ctx, node, scope)
      if (resolved) {
        return resolveStringType(ctx, resolved, scope, typeParameters)
      }
      if (node.typeName.type === 'Identifier') {
        const name = node.typeName.name
        if (typeParameters && typeParameters[name]) {
          return resolveStringType(
            ctx,
            typeParameters[name],
            scope,
            typeParameters,
          )
        }
        const getParam = (index = 0) =>
          resolveStringType(
            ctx,
            node.typeParameters!.params[index],
            scope,
            typeParameters,
          )
        switch (name) {
          case 'Extract':
            return getParam(1)
          case 'Exclude': {
            const excluded = getParam(1)
            return getParam().filter(s => !excluded.includes(s))
          }
          case 'Uppercase':
            return getParam().map(s => s.toUpperCase())
          case 'Lowercase':
            return getParam().map(s => s.toLowerCase())
          case 'Capitalize':
            return getParam().map(capitalize)
          case 'Uncapitalize':
            return getParam().map(s => s[0].toLowerCase() + s.slice(1))
          default:
            ctx.error(
              '解析索引类型时不支持的类型',
              node.typeName,
              scope,
            )
        }
      }
    }
  }
  return ctx.error('无法将索引类型解析为有限键', node, scope)
}

/**
 * 解析模板字符串键
 * 解析模板字面量类型中的键
 * @param ctx 类型解析上下文
 * @param node 模板字面量节点
 * @param scope 作用域
 * @returns 解析出的字符串键数组
 */
function resolveTemplateKeys(
  ctx: TypeResolveContext,
  node: TemplateLiteral,
  scope: TypeScope,
): string[] {
  // 处理没有表达式的简单模板字符串
  if (!node.expressions.length) {
    return [node.quasis[0].value.raw]
  }

  const res: string[] = []
  const e = node.expressions[0]
  const q = node.quasis[0]
  const leading = q ? q.value.raw : ``
  const resolved = resolveStringType(ctx, e, scope)
  // 递归解析剩余部分
  const restResolved = resolveTemplateKeys(
    ctx,
    {
      ...node,
      expressions: node.expressions.slice(1),
      quasis: q ? node.quasis.slice(1) : node.quasis,
    },
    scope,
  )

  // 组合所有可能的字符串组合
  for (const r of resolved) {
    for (const rr of restResolved) {
      res.push(leading + r + rr)
    }
  }

  return res
}

const SupportedBuiltinsSet = new Set([
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
] as const)

type GetSetType<T> = T extends Set<infer V> ? V : never

/**
 * 解析内置类型工具
 * 解析TypeScript内置的类型工具，如Partial、Required、Readonly、Pick和Omit
 * @param ctx 类型解析上下文
 * @param node 类型引用节点
 * @param name 内置类型工具名称
 * @param scope 作用域
 * @param typeParameters 类型参数
 * @returns 解析后的元素
 */
function resolveBuiltin(
  ctx: TypeResolveContext,
  node: TSTypeReference | TSExpressionWithTypeArguments,
  name: GetSetType<typeof SupportedBuiltinsSet>,
  scope: TypeScope,
  typeParameters?: Record<string, Node>,
): ResolvedElements {
  const t = resolveTypeElements(
    ctx,
    node.typeParameters!.params[0],
    scope,
    typeParameters,
  )
  switch (name) {
    case 'Partial': {
      // 将所有属性变为可选
      const res: ResolvedElements = { props: {}, calls: t.calls }
      Object.keys(t.props).forEach(key => {
        res.props[key] = { ...t.props[key], optional: true }
      })
      return res
    }
    case 'Required': {
      // 将所有属性变为必填
      const res: ResolvedElements = { props: {}, calls: t.calls }
      Object.keys(t.props).forEach(key => {
        res.props[key] = { ...t.props[key], optional: false }
      })
      return res
    }
    case 'Readonly':
      // 只读类型，直接返回原类型
      return t
    case 'Pick': {
      // 挑选指定的属性
      const picked = resolveStringType(
        ctx,
        node.typeParameters!.params[1],
        scope,
        typeParameters,
      )
      const res: ResolvedElements = { props: {}, calls: t.calls }
      for (const key of picked) {
        res.props[key] = t.props[key]
      }
      return res
    }
    case 'Omit':
      // 排除指定的属性
      const omitted = resolveStringType(
        ctx,
        node.typeParameters!.params[1],
        scope,
        typeParameters,
      )
      const res: ResolvedElements = { props: {}, calls: t.calls }
      for (const key in t.props) {
        if (!omitted.includes(key)) {
          res.props[key] = t.props[key]
        }
      }
      return res
  }
}

type ReferenceTypes =
  | TSTypeReference
  | TSExpressionWithTypeArguments
  | TSImportType
  | TSTypeQuery

/**
 * 解析类型引用
 * 解析类型引用节点，支持缓存已解析的引用
 * @param ctx 类型解析上下文
 * @param node 类型引用节点
 * @param scope 作用域
 * @param name 引用名称
 * @param onlyExported 是否只考虑导出的类型
 * @returns 解析后的类型节点或undefined
 */
function resolveTypeReference(
  ctx: TypeResolveContext,
  node: ReferenceTypes & {
    _resolvedReference?: ScopeTypeNode
  },
  scope?: TypeScope,
  name?: string,
  onlyExported = false,
): ScopeTypeNode | undefined {
  // 判断是否可以缓存解析结果
  const canCache = !scope?.isGenericScope
  // 如果可以缓存且已有缓存结果，则直接返回
  if (canCache && node._resolvedReference) {
    return node._resolvedReference
  }
  // 内部解析类型引用
  const resolved = innerResolveTypeReference(
    ctx,
    scope || ctxToScope(ctx),
    name || getReferenceName(node),
    node,
    onlyExported,
  )
  // 如果可以缓存，则缓存结果
  return canCache ? (node._resolvedReference = resolved) : resolved
}

/**
 * 内部解析类型引用
 * 内部递归解析类型引用的实现
 * @param ctx 类型解析上下文
 * @param scope 作用域
 * @param name 引用名称或路径数组
 * @param node 类型引用节点
 * @param onlyExported 是否只考虑导出的类型
 * @returns 解析后的类型节点或undefined
 */
function innerResolveTypeReference(
  ctx: TypeResolveContext,
  scope: TypeScope,
  name: string | string[],
  node: ReferenceTypes,
  onlyExported: boolean,
): ScopeTypeNode | undefined {
  // 处理单个名称的引用
  if (typeof name === 'string') {
    // 检查是否是导入的类型
    if (scope.imports[name]) {
      return resolveTypeFromImport(ctx, node, name, scope)
    } else {
      // 确定查找源
      const lookupSource = 
        node.type === 'TSTypeQuery'
          ? onlyExported
            ? scope.exportedDeclares
            : scope.declares
          : onlyExported
            ? scope.exportedTypes
            : scope.types
      // 从查找源中查找
      if (lookupSource[name]) {
        return lookupSource[name]
      } else {
        // 回退到全局作用域
        const globalScopes = resolveGlobalScope(ctx)
        if (globalScopes) {
          for (const s of globalScopes) {
            const src = node.type === 'TSTypeQuery' ? s.declares : s.types
            if (src[name]) {
              ;(ctx.deps || (ctx.deps = new Set())).add(s.filename)
              return src[name]
            }
          }
        }
      }
    }
  } else {
    // 处理名称路径数组（如命名空间）
    let ns = innerResolveTypeReference(ctx, scope, name[0], node, onlyExported)
    if (ns) {
      if (ns.type !== 'TSModuleDeclaration') {
        // 命名空间与其他类型合并，附加为_ns
        ns = ns._ns
      }
      if (ns) {
        const childScope = moduleDeclToScope(ctx, ns, ns._ownerScope || scope)
        return innerResolveTypeReference(
          ctx,
          childScope,
          name.length > 2 ? name.slice(1) : name[name.length - 1],
          node,
          !ns.declare,
        )
      }
    }
  }
}

/**
 * 获取引用名称
 * 从类型引用节点中提取引用名称
 * @param node 类型引用节点
 * @returns 引用名称或名称路径数组
 */
function getReferenceName(node: ReferenceTypes): string | string[] {
  const ref = 
    node.type === 'TSTypeReference'
      ? node.typeName
      : node.type === 'TSExpressionWithTypeArguments'
        ? node.expression
        : node.type === 'TSImportType'
          ? node.qualifier
          : node.exprName
  if (ref?.type === 'Identifier') {
    return ref.name
  } else if (ref?.type === 'TSQualifiedName') {
    return qualifiedNameToPath(ref)
  } else {
    return 'default'
  }
}

/**
 * 将限定名称转换为路径数组
 * 递归将TSQualifiedName或Identifier转换为名称路径数组
 * @param node 标识符或限定名称节点
 * @returns 名称路径数组
 */
function qualifiedNameToPath(node: Identifier | TSQualifiedName): string[] {
  if (node.type === 'Identifier') {
    return [node.name]
  } else {
    return [...qualifiedNameToPath(node.left), node.right.name]
  }
}

/**
 * 解析全局作用域
 * 从全局类型文件中解析全局作用域
 * @param ctx 类型解析上下文
 * @returns 全局作用域数组或undefined
 */
function resolveGlobalScope(ctx: TypeResolveContext): TypeScope[] | undefined {
  if (ctx.options.globalTypeFiles) {
    const fs = resolveFS(ctx)
    if (!fs) {
      throw new Error('[vue/compiler-sfc] globalTypeFiles requires fs access.')
    }
    return ctx.options.globalTypeFiles.map(file =>
      fileToScope(ctx, normalizePath(file), true),
    )
  }
}

let ts: typeof TS | undefined
let loadTS: (() => typeof TS) | undefined

/**
 * @private
 */
export function registerTS(_loadTS: () => typeof TS): void {
  loadTS = () => {
    try {
      return _loadTS()
    } catch (err: any) {
      if (
        typeof err.message === 'string' &&
        err.message.includes('Cannot find module')
      ) {
        throw new Error(
          'Failed to load TypeScript, which is required for resolving imported types. ' +
            'Please make sure "typescript" is installed as a project dependency.',
        )
      } else {
        throw new Error(
          'Failed to load TypeScript for resolving imported types.',
        )
      }
    }
  }
}

type FS = NonNullable<SFCScriptCompileOptions['fs']>

/**
 * 解析文件系统
 * 获取或创建适合当前上下文的文件系统接口
 * @param ctx 类型解析上下文
 * @returns 文件系统接口或undefined
 */
function resolveFS(ctx: TypeResolveContext): FS | undefined {
  if (ctx.fs) {
    return ctx.fs
  }
  if (!ts && loadTS) {
    ts = loadTS()
  }
  const fs = ctx.options.fs || ts?.sys
  if (!fs) {
    return
  }
  return (ctx.fs = {
    fileExists(file) {
      if (file.endsWith('.vue.ts') && !file.endsWith('.d.vue.ts')) {
        file = file.replace(/\.ts$/, '')
      }
      return fs.fileExists(file)
    },
    readFile(file) {
      if (file.endsWith('.vue.ts') && !file.endsWith('.d.vue.ts')) {
        file = file.replace(/\.ts$/, '')
      }
      return fs.readFile(file)
    },
    realpath: fs.realpath,
  })
}

/**
 * 从导入中解析类型
 * 解析从导入语句中引用的类型
 * @param ctx 类型解析上下文
 * @param node 类型引用节点
 * @param name 引用名称
 * @param scope 当前作用域
 * @returns 解析后的类型节点或undefined
 */
function resolveTypeFromImport(
  ctx: TypeResolveContext,
  node: ReferenceTypes,
  name: string,
  scope: TypeScope,
): ScopeTypeNode | undefined {
  const { source, imported } = scope.imports[name]
  const sourceScope = importSourceToScope(ctx, node, scope, source)
  return resolveTypeReference(ctx, node, sourceScope, imported, true)
}

/**
 * 将导入源转换为作用域
 * 解析导入源路径并创建对应的作用域
 * @param ctx 类型解析上下文
 * @param node 当前节点
 * @param scope 当前作用域
 * @param source 导入源路径
 * @returns 解析后的作用域
 */
function importSourceToScope(
  ctx: TypeResolveContext,
  node: Node,
  scope: TypeScope,
  source: string,
): TypeScope {
  let fs: FS | undefined
  try {
    fs = resolveFS(ctx)
  } catch (err: any) {
    return ctx.error(err.message, node, scope)
  }
  if (!fs) {
    return ctx.error(
      `No fs option provided to \`compileScript\` in non-Node environment. ` +
        `File system access is required for resolving imported types.`,
      node,
      scope,
    )
  }

  let resolved: string | undefined = scope.resolvedImportSources[source]
  if (!resolved) {
    if (source.startsWith('..')) {
      const osSpecificJoinFn = process.platform === 'win32' ? join : joinPaths

      const filename = osSpecificJoinFn(dirname(scope.filename), source)
      resolved = resolveExt(filename, fs)
    } else if (source[0] === '.') {
      // 相对导入 - 快速路径
      const filename = joinPaths(dirname(scope.filename), source)
      resolved = resolveExt(filename, fs)
    } else {
      // 模块或别名导入 - 使用完整TS解析，仅在Node环境支持
      if (!__CJS__) {
        return ctx.error(
          `在浏览器构建中不支持从非相对源导入类型。`,
          node,
          scope,
        )
      }
      if (!ts) {
        if (loadTS) ts = loadTS()
        if (!ts) {
          return ctx.error(
            `无法解析导入源 ${JSON.stringify(source)}。 ` +
              `为了支持从模块导入解析类型，Vue需要typescript作为对等依赖。`,
            node,
            scope,
          )
        }
      }
      resolved = resolveWithTS(scope.filename, source, ts, fs)
    }
    if (resolved) {
      resolved = scope.resolvedImportSources[source] = normalizePath(resolved)
    }
  }
  if (resolved) {
    // (hmr) 在ctx上注册依赖文件
    ;(ctx.deps || (ctx.deps = new Set())).add(resolved)
    return fileToScope(ctx, resolved)
  } else {
    return ctx.error(
      `无法解析导入源 ${JSON.stringify(source)}。`,
      node,
      scope,
    )
  }
}

/**
 * 解析文件扩展名
 * 尝试不同的文件扩展名来解析文件路径
 * @param filename 文件名
 * @param fs 文件系统接口
 * @returns 解析后的文件路径或undefined
 */
function resolveExt(filename: string, fs: FS) {
  // #8339 ts可能导入.js文件，但我们应该解析为对应的ts或d.ts
  filename = filename.replace(/\.js$/, '')
  const tryResolve = (filename: string) => {
    if (fs.fileExists(filename)) return filename
  }
  return (
    tryResolve(filename) ||
    tryResolve(filename + `.ts`) ||
    tryResolve(filename + `.tsx`) ||
    tryResolve(filename + `.d.ts`) ||
    tryResolve(joinPaths(filename, `index.ts`)) ||
    tryResolve(joinPaths(filename, `index.tsx`)) ||
    tryResolve(joinPaths(filename, `index.d.ts`))
  )
}

interface CachedConfig {
  config: TS.ParsedCommandLine
  cache?: TS.ModuleResolutionCache
}

const tsConfigCache = createCache<CachedConfig[]>()
const tsConfigRefMap = new Map<string, string>()

/**
 * 使用TypeScript解析器解析导入源
 * 利用TypeScript的模块解析机制来解析导入路径
 * @param containingFile 包含导入语句的文件
 * @param source 导入源路径
 * @param ts TypeScript模块
 * @param fs 文件系统接口
 * @returns 解析后的文件路径或undefined
 */
function resolveWithTS(
  containingFile: string,
  source: string,
  ts: typeof TS,
  fs: FS,
): string | undefined {
  if (!__CJS__) return

  // 1. 解析tsconfig.json
  const configPath = ts.findConfigFile(containingFile, fs.fileExists)
  // 2. 加载tsconfig.json
  let tsCompilerOptions: TS.CompilerOptions
  let tsResolveCache: TS.ModuleResolutionCache | undefined
  if (configPath) {
    let configs: CachedConfig[]
    const normalizedConfigPath = normalizePath(configPath)
    const cached = tsConfigCache.get(normalizedConfigPath)
    if (!cached) {
      configs = loadTSConfig(configPath, ts, fs).map(config => ({ config }))
      tsConfigCache.set(normalizedConfigPath, configs)
    } else {
      configs = cached
    }
    let matchedConfig: CachedConfig | undefined
    if (configs.length === 1) {
      matchedConfig = configs[0]
    } else {
      // resolve which config matches the current file
      for (const c of configs) {
        const base = normalizePath(
          (c.config.options.pathsBasePath as string) ||
            dirname(c.config.options.configFilePath as string),
        )
        const included: string[] | undefined = c.config.raw?.include
        const excluded: string[] | undefined = c.config.raw?.exclude
        if (
          (!included && (!base || containingFile.startsWith(base))) ||
          included?.some(p => isMatch(containingFile, joinPaths(base, p)))
        ) {
          if (
            excluded &&
            excluded.some(p => isMatch(containingFile, joinPaths(base, p)))
          ) {
            continue
          }
          matchedConfig = c
          break
        }
      }
      if (!matchedConfig) {
        matchedConfig = configs[configs.length - 1]
      }
    }
    tsCompilerOptions = matchedConfig.config.options
    tsResolveCache =
      matchedConfig.cache ||
      (matchedConfig.cache = ts.createModuleResolutionCache(
        process.cwd(),
        createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames),
        tsCompilerOptions,
      ))
  } else {
    tsCompilerOptions = {}
  }

  // 3. resolve
  const res = ts.resolveModuleName(
    source,
    containingFile,
    tsCompilerOptions,
    fs,
    tsResolveCache,
  )

  if (res.resolvedModule) {
    let filename = res.resolvedModule.resolvedFileName
    if (filename.endsWith('.vue.ts') && !filename.endsWith('.d.vue.ts')) {
      filename = filename.replace(/\.ts$/, '')
    }
    return fs.realpath ? fs.realpath(filename) : filename
  }
}

/**
 * 加载TypeScript配置文件
 * 加载并解析tsconfig.json文件，包括处理项目引用
 * @param configPath tsconfig.json文件路径
 * @param ts TypeScript模块
 * @param fs 文件系统接口
 * @param visited 已访问的配置文件集合，用于避免循环引用
 * @returns 解析后的TypeScript配置数组
 */
function loadTSConfig(
  configPath: string,
  ts: typeof TS,
  fs: FS,
  visited = new Set<string>(),
): TS.ParsedCommandLine[] {
  // 只有在测试环境下，`fs` 才不是 `ts.sys`
  const parseConfigHost = __TEST__
    ? {
        ...fs,
        useCaseSensitiveFileNames: true,
        readDirectory: () => [],
      }
    : ts.sys
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, fs.readFile).config,
    parseConfigHost,
    dirname(configPath),
    undefined,
    configPath,
  )
  const res = [config]
  visited.add(configPath)
  if (config.projectReferences) {
    for (const ref of config.projectReferences) {
      const refPath = ts.resolveProjectReferencePath(ref)
      if (visited.has(refPath) || !fs.fileExists(refPath)) {
        continue
      }
      tsConfigRefMap.set(refPath, configPath)
      res.unshift(...loadTSConfig(refPath, ts, fs, visited))
    }
  }
  return res
}

const fileToScopeCache = createCache<TypeScope>()

/**
 * 清除类型缓存
 * 使指定文件的类型缓存失效
 * @param filename 要清除缓存的文件路径
 * @private
 */
export function invalidateTypeCache(filename: string): void {
  filename = normalizePath(filename)
  fileToScopeCache.delete(filename)
  tsConfigCache.delete(filename)
  const affectedConfig = tsConfigRefMap.get(filename)
  if (affectedConfig) tsConfigCache.delete(affectedConfig)
}

/**
 * 将文件转换为类型作用域
 * 解析文件并创建对应的类型作用域
 * @param ctx 类型解析上下文
 * @param filename 文件路径
 * @param asGlobal 是否作为全局作用域
 * @returns 解析后的类型作用域
 */
export function fileToScope(
  ctx: TypeResolveContext,
  filename: string,
  asGlobal = false,
): TypeScope {
  const cached = fileToScopeCache.get(filename)
  if (cached) {
    return cached
  }
  // fs should be guaranteed to exist here
  const fs = resolveFS(ctx)!
  const source = fs.readFile(filename) || ''
  const body = parseFile(filename, source, fs, ctx.options.babelParserPlugins)
  const scope = new TypeScope(filename, source, 0, recordImports(body))
  recordTypes(ctx, body, scope, asGlobal)
  fileToScopeCache.set(filename, scope)
  return scope
}

/**
 * 解析文件
 * 解析文件内容为AST节点数组
 * @param filename 文件路径
 * @param content 文件内容
 * @param fs 文件系统接口
 * @param parserPlugins Babel解析器插件
 * @returns 解析后的AST节点数组
 */
function parseFile(
  filename: string,
  content: string,
  fs: FS,
  parserPlugins?: SFCScriptCompileOptions['babelParserPlugins'],
): Statement[] {
  const ext = extname(filename)
  if (ext === '.ts' || ext === '.mts' || ext === '.tsx' || ext === '.mtsx') {
    return babelParse(content, {
      plugins: resolveParserPlugins(
        ext.slice(1),
        parserPlugins,
        /\.d\.m?ts$/.test(filename),
      ),
      sourceType: 'module',
    }).program.body
  }

  // simulate `allowArbitraryExtensions` on TypeScript >= 5.0
  const isUnknownTypeSource = !/\.[cm]?[tj]sx?$/.test(filename)
  const arbitraryTypeSource = `${filename.slice(0, -ext.length)}.d${ext}.ts`
  const hasArbitraryTypeDeclaration =
    isUnknownTypeSource && fs.fileExists(arbitraryTypeSource)
  if (hasArbitraryTypeDeclaration) {
    return babelParse(fs.readFile(arbitraryTypeSource)!, {
      plugins: resolveParserPlugins('ts', parserPlugins, true),
      sourceType: 'module',
    }).program.body
  }

  if (ext === '.vue') {
    const {
      descriptor: { script, scriptSetup },
    } = parse(content)
    if (!script && !scriptSetup) {
      return []
    }

    // ensure the correct offset with original source
    const scriptOffset = script ? script.loc.start.offset : Infinity
    const scriptSetupOffset = scriptSetup
      ? scriptSetup.loc.start.offset
      : Infinity
    const firstBlock = scriptOffset < scriptSetupOffset ? script : scriptSetup
    const secondBlock = scriptOffset < scriptSetupOffset ? scriptSetup : script

    let scriptContent =
      ' '.repeat(Math.min(scriptOffset, scriptSetupOffset)) +
      firstBlock!.content
    if (secondBlock) {
      scriptContent +=
        ' '.repeat(secondBlock.loc.start.offset - script!.loc.end.offset) +
        secondBlock.content
    }
    const lang = script?.lang || scriptSetup?.lang
    return babelParse(scriptContent, {
      plugins: resolveParserPlugins(lang!, parserPlugins),
      sourceType: 'module',
    }).program.body
  }
  return []
}

/**
 * 将上下文转换为作用域
 * 将类型解析上下文转换为类型作用域
 * @param ctx 类型解析上下文
 * @returns 类型作用域
 */
function ctxToScope(ctx: TypeResolveContext): TypeScope {
  if (ctx.scope) {
    return ctx.scope
  }

  const body =
    'ast' in ctx
      ? ctx.ast
      : ctx.scriptAst
        ? [...ctx.scriptAst.body, ...ctx.scriptSetupAst!.body]
        : ctx.scriptSetupAst!.body

  const scope = new TypeScope(
    ctx.filename,
    ctx.source,
    'startOffset' in ctx ? ctx.startOffset! : 0,
    'userImports' in ctx ? Object.create(ctx.userImports) : recordImports(body),
  )

  recordTypes(ctx, body, scope)

  return (ctx.scope = scope)
}

/**
 * 模块声明转换为作用域
 * 将模块声明转换为类型作用域
 * @param ctx 类型解析上下文
 * @param node 模块声明节点
 * @param parentScope 父作用域
 * @returns 转换后的类型作用域
 */
function moduleDeclToScope(
  ctx: TypeResolveContext,
  node: TSModuleDeclaration & { _resolvedChildScope?: TypeScope },
  parentScope: TypeScope,
): TypeScope {
  if (node._resolvedChildScope) {
    return node._resolvedChildScope
  }

  const scope = createChildScope(parentScope)

  if (node.body.type === 'TSModuleDeclaration') {
    const decl = node.body as TSModuleDeclaration & WithScope
    decl._ownerScope = scope
    const id = getId(decl.id)
    scope.types[id] = scope.exportedTypes[id] = decl
  } else {
    recordTypes(ctx, node.body.body, scope)
  }
  return (node._resolvedChildScope = scope)
}

/**
 * 创建子作用域
 * 基于父作用域创建一个新的子作用域
 * @param parentScope 父作用域
 * @returns 创建的子作用域
 */
function createChildScope(parentScope: TypeScope) {
  return new TypeScope(
    parentScope.filename,
    parentScope.source,
    parentScope.offset,
    Object.create(parentScope.imports),
    Object.create(parentScope.types),
    Object.create(parentScope.declares),
  )
}

/**
 * 导入导出正则表达式
 * 用于匹配导入和导出语句的类型
 */
const importExportRE = /^Import|^Export/

/**
 * 记录类型信息
 * 从AST节点数组中提取类型信息并记录到作用域中
 * @param ctx 类型解析上下文
 * @param body AST节点数组
 * @param scope 类型作用域
 * @param asGlobal 是否作为全局作用域
 */
function recordTypes(
  ctx: TypeResolveContext,
  body: Statement[],
  scope: TypeScope,
  asGlobal = false,
) {
  const { types, declares, exportedTypes, exportedDeclares, imports } = scope
  const isAmbient = asGlobal
    ? !body.some(s => importExportRE.test(s.type))
    : false
  for (const stmt of body) {
    if (asGlobal) {
      if (isAmbient) {
        if ((stmt as any).declare) {
          recordType(stmt, types, declares)
        }
      } else if (stmt.type === 'TSModuleDeclaration' && stmt.global) {
        for (const s of (stmt.body as TSModuleBlock).body) {
          recordType(s, types, declares)
        }
      }
    } else {
      recordType(stmt, types, declares)
    }
  }
  if (!asGlobal) {
    for (const stmt of body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.declaration) {
          recordType(stmt.declaration, types, declares)
          recordType(stmt.declaration, exportedTypes, exportedDeclares)
        } else {
          for (const spec of stmt.specifiers) {
            if (spec.type === 'ExportSpecifier') {
              const local = spec.local.name
              const exported = getId(spec.exported)
              if (stmt.source) {
                // re-export, register an import + export as a type reference
                imports[exported] = {
                  source: stmt.source.value,
                  imported: local,
                }
                exportedTypes[exported] = {
                  type: 'TSTypeReference',
                  typeName: {
          type: 'Identifier',
          name: local,
                  },
                  _ownerScope: scope,
                }
              } else if (types[local]) {
                // exporting local defined type
                exportedTypes[exported] = types[local]
              }
            }
          }
        }
      } else if (stmt.type === 'ExportAllDeclaration') {
        const sourceScope = importSourceToScope(
          ctx,
          stmt.source,
          scope,
          stmt.source.value,
        )
        Object.assign(scope.exportedTypes, sourceScope.exportedTypes)
      } else if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
        if (stmt.declaration.type !== 'Identifier') {
          recordType(stmt.declaration, types, declares, 'default')
          recordType(
            stmt.declaration,
            exportedTypes,
            exportedDeclares,
            'default',
          )
        } else if (types[stmt.declaration.name]) {
          exportedTypes['default'] = types[stmt.declaration.name]
        }
      }
    }
  }
  for (const key of Object.keys(types)) {
    const node = types[key]
    node._ownerScope = scope
    if (node._ns) node._ns._ownerScope = scope
  }
  for (const key of Object.keys(declares)) {
    declares[key]._ownerScope = scope
  }
}

/**
 * 记录类型
 * 记录AST节点中的类型信息到作用域中
 * @param node AST节点
 * @param types 类型记录对象
 * @param declares 声明记录对象
 * @param overwriteId 可选的覆盖ID
 */
function recordType(
  node: Node,
  types: Record<string, Node>,
  declares: Record<string, Node>,
  overwriteId?: string,
) {
  switch (node.type) {
    case 'TSInterfaceDeclaration':
    case 'TSEnumDeclaration':
    case 'TSModuleDeclaration': {
      const id = overwriteId || getId(node.id)
      let existing = types[id]
      if (existing) {
        if (node.type === 'TSModuleDeclaration') {
          if (existing.type === 'TSModuleDeclaration') {
            mergeNamespaces(existing as typeof node, node)
          } else {
            attachNamespace(existing, node)
          }
          break
        }
        if (existing.type === 'TSModuleDeclaration') {
          // replace and attach namespace
          types[id] = node
          attachNamespace(node, existing)
          break
        }

        if (existing.type !== node.type) {
          // type-level error
          break
        }
        if (node.type === 'TSInterfaceDeclaration') {
          ;(existing as typeof node).body.body.push(...node.body.body)
        } else {
          ;(existing as typeof node).members.push(...node.members)
        }
      } else {
        types[id] = node
      }
      break
    }
    case 'ClassDeclaration':
      if (overwriteId || node.id) types[overwriteId || getId(node.id!)] = node
      break
    case 'TSTypeAliasDeclaration':
      types[node.id.name] = node.typeParameters ? node : node.typeAnnotation
      break
    case 'TSDeclareFunction':
      if (node.id) declares[node.id.name] = node
      break
    case 'VariableDeclaration': {
      if (node.declare) {
        for (const decl of node.declarations) {
          if (decl.id.type === 'Identifier' && decl.id.typeAnnotation) {
            declares[decl.id.name] = (
              decl.id.typeAnnotation as TSTypeAnnotation
            ).typeAnnotation
          }
        }
      }
      break
    }
  }
}

/**
 * 合并命名空间
 * 将一个命名空间的内容合并到另一个命名空间中
 * @param to 目标命名空间
 * @param from 源命名空间
 */
function mergeNamespaces(to: TSModuleDeclaration, from: TSModuleDeclaration) {
  const toBody = to.body
  const fromBody = from.body
  if (toBody.type === 'TSModuleDeclaration') {
    if (fromBody.type === 'TSModuleDeclaration') {
      // both decl
      mergeNamespaces(toBody, fromBody)
    } else {
      // to: decl -> from: block
      fromBody.body.push({
        type: 'ExportNamedDeclaration',
        declaration: toBody,
        exportKind: 'type',
        specifiers: [],
      })
    }
  } else if (fromBody.type === 'TSModuleDeclaration') {
    // to: block <- from: decl
    toBody.body.push({
      type: 'ExportNamedDeclaration',
      declaration: fromBody,
      exportKind: 'type',
      specifiers: [],
    })
  } else {
    // both block
    toBody.body.push(...fromBody.body)
  }
}

/**
 * 附加命名空间
 * 将命名空间附加到节点上
 * @param to 目标节点
 * @param ns 要附加的命名空间
 */
function attachNamespace(
  to: Node & { _ns?: TSModuleDeclaration },
  ns: TSModuleDeclaration,
) {
  if (!to._ns) {
    to._ns = ns
  } else {
    mergeNamespaces(to._ns, ns)
  }
}

/**
 * 记录导入信息
 * 从AST节点数组中记录导入信息
 * @param body AST节点数组
 * @returns 导入信息记录对象
 */
export function recordImports(body: Statement[]): Record<string, Import> {
  const imports: TypeScope['imports'] = Object.create(null)
  for (const s of body) {
    recordImport(s, imports)
  }
  return imports
}

/**
 * 记录单个导入
 * 记录单个AST节点中的导入信息
 * @param node AST节点
 * @param imports 导入信息记录对象
 */
function recordImport(node: Node, imports: TypeScope['imports']) {
  if (node.type !== 'ImportDeclaration') {
    return
  }
  for (const s of node.specifiers) {
    imports[s.local.name] = {
      imported: getImportedName(s),
      source: node.source.value,
    }
  }
}

/**
 * 推断运行时类型
 * 从TypeScript类型节点推断运行时类型信息
 * @param ctx 类型解析上下文
 * @param node AST节点
 * @param scope 类型作用域
 * @param isKeyOf 是否为keyof操作符
 * @returns 推断的运行时类型数组
 */
export function inferRuntimeType(
  ctx: TypeResolveContext,
  node: Node & MaybeWithScope,
  scope: TypeScope = node._ownerScope || ctxToScope(ctx),
  isKeyOf = false,
): string[] {
  try {
    switch (node.type) {
      case 'TSStringKeyword':
        return ['String']
      case 'TSNumberKeyword':
        return ['Number']
      case 'TSBooleanKeyword':
        return ['Boolean']
      case 'TSObjectKeyword':
        return ['Object']
      case 'TSNullKeyword':
        return ['null']
      case 'TSTypeLiteral':
      case 'TSInterfaceDeclaration': {
        // TODO (nice to have) generate runtime property validation
        const types = new Set<string>()
        const members =
          node.type === 'TSTypeLiteral' ? node.members : node.body.body

        for (const m of members) {
          if (isKeyOf) {
            if (
              m.type === 'TSPropertySignature' &&
              m.key.type === 'NumericLiteral'
            ) {
              types.add('Number')
            } else if (m.type === 'TSIndexSignature') {
              const annotation = m.parameters[0].typeAnnotation
              if (annotation && annotation.type !== 'Noop') {
                const type = inferRuntimeType(
                  ctx,
                  annotation.typeAnnotation,
                  scope,
                )[0]
                if (type === UNKNOWN_TYPE) return [UNKNOWN_TYPE]
                types.add(type)
              }
            } else {
              types.add('String')
            }
          } else if (
            m.type === 'TSCallSignatureDeclaration' ||
            m.type === 'TSConstructSignatureDeclaration'
          ) {
            types.add('Function')
          } else {
            types.add('Object')
          }
        }

        return types.size
          ? Array.from(types)
          : [isKeyOf ? UNKNOWN_TYPE : 'Object']
      }
      case 'TSPropertySignature':
        if (node.typeAnnotation) {
          return inferRuntimeType(
            ctx,
            node.typeAnnotation.typeAnnotation,
            scope,
          )
        }
        break
      case 'TSMethodSignature':
      case 'TSFunctionType':
        return ['Function']
      case 'TSArrayType':
      case 'TSTupleType':
        // TODO (nice to have) generate runtime element type/length checks
        return ['Array']

      case 'TSLiteralType':
        switch (node.literal.type) {
          case 'StringLiteral':
            return ['String']
          case 'BooleanLiteral':
            return ['Boolean']
          case 'NumericLiteral':
          case 'BigIntLiteral':
            return ['Number']
          default:
            return [UNKNOWN_TYPE]
        }

      case 'TSTypeReference': {
        const resolved = resolveTypeReference(ctx, node, scope)
        if (resolved) {
          // #13240
          // Special case for function type aliases to ensure correct runtime behavior
          // other type aliases still fallback to unknown as before
          if (
            resolved.type === 'TSTypeAliasDeclaration' &&
            resolved.typeAnnotation.type === 'TSFunctionType'
          ) {
            return ['Function']
          }
          return inferRuntimeType(ctx, resolved, resolved._ownerScope, isKeyOf)
        }

        if (node.typeName.type === 'Identifier') {
          if (isKeyOf) {
            switch (node.typeName.name) {
              case 'String':
              case 'Array':
              case 'ArrayLike':
              case 'Parameters':
              case 'ConstructorParameters':
              case 'ReadonlyArray':
                return ['String', 'Number']

              // TS built-in utility types
              case 'Record':
              case 'Partial':
              case 'Required':
              case 'Readonly':
                if (node.typeParameters && node.typeParameters.params[0]) {
                  return inferRuntimeType(
                    ctx,
                    node.typeParameters.params[0],
                    scope,
                    true,
                  )
                }
                break
              case 'Pick':
              case 'Extract':
                if (node.typeParameters && node.typeParameters.params[1]) {
                  return inferRuntimeType(
                    ctx,
                    node.typeParameters.params[1],
                    scope,
                  )
                }
                break

              case 'Function':
              case 'Object':
              case 'Set':
              case 'Map':
              case 'WeakSet':
              case 'WeakMap':
              case 'Date':
              case 'Promise':
              case 'Error':
              case 'Uppercase':
              case 'Lowercase':
              case 'Capitalize':
              case 'Uncapitalize':
              case 'ReadonlyMap':
              case 'ReadonlySet':
                return ['String']
            }
          } else {
            switch (node.typeName.name) {
              case 'Array':
              case 'Function':
              case 'Object':
              case 'Set':
              case 'Map':
              case 'WeakSet':
              case 'WeakMap':
              case 'Date':
              case 'Promise':
              case 'Error':
                return [node.typeName.name]

              // TS built-in utility types
              // https://www.typescriptlang.org/docs/handbook/utility-types.html
              case 'Partial':
              case 'Required':
              case 'Readonly':
              case 'Record':
              case 'Pick':
              case 'Omit':
              case 'InstanceType':
                return ['Object']

              case 'Uppercase':
              case 'Lowercase':
              case 'Capitalize':
              case 'Uncapitalize':
                return ['String']

              case 'Parameters':
              case 'ConstructorParameters':
              case 'ReadonlyArray':
                return ['Array']

              case 'ReadonlyMap':
                return ['Map']
              case 'ReadonlySet':
                return ['Set']

              case 'NonNullable':
                if (node.typeParameters && node.typeParameters.params[0]) {
                  return inferRuntimeType(
                    ctx,
                    node.typeParameters.params[0],
                    scope,
                  ).filter(t => t !== 'null')
                }
                break
              case 'Extract':
                if (node.typeParameters && node.typeParameters.params[1]) {
                  return inferRuntimeType(
                    ctx,
                    node.typeParameters.params[1],
                    scope,
                  )
                }
                break
              case 'Exclude':
              case 'OmitThisParameter':
                if (node.typeParameters && node.typeParameters.params[0]) {
                  return inferRuntimeType(
                    ctx,
                    node.typeParameters.params[0],
                    scope,
                  )
                }
                break
            }
          }
        }
        // cannot infer, fallback to UNKNOWN: ThisParameterType
        break
      }

      case 'TSParenthesizedType':
        return inferRuntimeType(ctx, node.typeAnnotation, scope)

      case 'TSUnionType':
        return flattenTypes(ctx, node.types, scope, isKeyOf)
      case 'TSIntersectionType': {
        return flattenTypes(ctx, node.types, scope, isKeyOf).filter(
          t => t !== UNKNOWN_TYPE,
        )
      }

      case 'TSEnumDeclaration':
        return inferEnumType(node)

      case 'TSSymbolKeyword':
        return ['Symbol']

      case 'TSIndexedAccessType': {
        const types = resolveIndexType(ctx, node, scope)
        return flattenTypes(ctx, types, scope, isKeyOf)
      }

      case 'ClassDeclaration':
        return ['Object']

      case 'TSImportType': {
        const sourceScope = importSourceToScope(
          ctx,
          node.argument,
          scope,
          node.argument.value,
        )
        const resolved = resolveTypeReference(ctx, node, sourceScope)
        if (resolved) {
          return inferRuntimeType(ctx, resolved, resolved._ownerScope)
        }
        break
      }

      case 'TSTypeQuery': {
        const id = node.exprName
        if (id.type === 'Identifier') {
          // typeof only support identifier in local scope
          const matched = scope.declares[id.name]
          if (matched) {
            return inferRuntimeType(ctx, matched, matched._ownerScope, isKeyOf)
          }
        }
        break
      }

      // e.g. readonly
      case 'TSTypeOperator': {
        return inferRuntimeType(
          ctx,
          node.typeAnnotation,
          scope,
          node.operator === 'keyof',
        )
      }

      case 'TSAnyKeyword': {
        if (isKeyOf) {
          return ['String', 'Number', 'Symbol']
        }
        break
      }
    }
  } catch (e) {
    // always soft fail on failed runtime type inference
  }
  return [UNKNOWN_TYPE] // no runtime check
}

/**
 * 展平类型数组
 * 将多个类型节点的运行时类型推断结果展平为一个数组
 * @param ctx 类型解析上下文
 * @param types 类型节点数组
 * @param scope 类型作用域
 * @param isKeyOf 是否为keyof操作符
 * @returns 展平后的运行时类型数组
 */
function flattenTypes(
  ctx: TypeResolveContext,
  types: TSType[],
  scope: TypeScope,
  isKeyOf: boolean = false,
): string[] {
  if (types.length === 1) {
    return inferRuntimeType(ctx, types[0], scope, isKeyOf)
  }
  return [
    ...new Set(
      ([] as string[]).concat(
        ...types.map(t => inferRuntimeType(ctx, t, scope, isKeyOf)),
      ),
    ),
  ]
}

/**
 * 推断枚举类型
 * 推断枚举声明的运行时类型
 * @param node 枚举声明节点
 * @returns 推断的运行时类型数组
 */
function inferEnumType(node: TSEnumDeclaration): string[] {
  const types = new Set<string>()
  for (const m of node.members) {
    if (m.initializer) {
      switch (m.initializer.type) {
        case 'StringLiteral':
          types.add('String')
          break
        case 'NumericLiteral':
          types.add('Number')
          break
      }
    }
  }
  return types.size ? [...types] : ['Number']
}

/**
 * 解析ExtractPropTypes
 * 支持ExtractPropTypes辅助函数 - 非详尽实现，主要针对流行组件库如element-plus和antd-vue
 * @param props 已解析的元素属性
 * @param scope 类型作用域
 * @returns 解析后的元素属性
 */
function resolveExtractPropTypes(
  { props }: ResolvedElements,
  scope: TypeScope,
): ResolvedElements {
  const res: ResolvedElements = { props: {} }
  for (const key in props) {
    const raw = props[key]
    res.props[key] = reverseInferType(
      raw.key,
      raw.typeAnnotation!.typeAnnotation,
      scope,
    )
  }
  return res
}

/**
 * 反向推断类型
 * 从类型节点反向推断属性签名
 * @param key 属性键表达式
 * @param node 类型节点
 * @param scope 类型作用域
 * @param optional 是否可选
 * @param checkObjectSyntax 是否检查对象语法
 * @returns 生成的属性签名
 */
function reverseInferType(
  key: Expression,
  node: TSType,
  scope: TypeScope,
  optional = true,
  checkObjectSyntax = true,
): TSPropertySignature & WithScope {
  if (checkObjectSyntax && node.type === 'TSTypeLiteral') {
    // check { type: xxx }
    const typeType = findStaticPropertyType(node, 'type')
    if (typeType) {
      const requiredType = findStaticPropertyType(node, 'required')
      const optional =
       requiredType &&
        requiredType.type === 'TSLiteralType' &&
        requiredType.literal.type === 'BooleanLiteral'
          ? !requiredType.literal.value
          : true
      return reverseInferType(key, typeType, scope, optional, false)
    }
  } else if (
    node.type === 'TSTypeReference' &&
    node.typeName.type === 'Identifier'
  ) {
    if (node.typeName.name.endsWith('Constructor')) {
      return createProperty(
        key,
        ctorToType(node.typeName.name),
        scope,
        optional,
      )
    } else if (node.typeName.name === 'PropType' && node.typeParameters) {
      // PropType<{}>
      return createProperty(key, node.typeParameters.params[0], scope, optional)
    }
  }
  if (
    (node.type === 'TSTypeReference' || node.type === 'TSImportType') &&
    node.typeParameters
  ) {
    // try if we can catch Foo.Bar<XXXConstructor>
    for (const t of node.typeParameters.params) {
      const inferred = reverseInferType(key, t, scope, optional)
      if (inferred) return inferred
    }
  }
  return createProperty(key, { type: `TSNullKeyword` }, scope, optional)
}

/**
 * 构造函数类型转换
 * 将构造函数类型名称转换为对应的类型节点
 * @param ctorType 构造函数类型名称
 * @returns 对应的类型节点
 */
function ctorToType(ctorType: string): TSType {
  const ctor = ctorType.slice(0, -11)
  switch (ctor) {
    case 'String':
    case 'Number':
    case 'Boolean':
      return { type: `TS${ctor}Keyword` }
    case 'Array':
    case 'Function':
    case 'Object':
    case 'Set':
    case 'Map':
    case 'WeakSet':
    case 'WeakMap':
    case 'Date':
    case 'Promise':
      return {
        type: 'TSTypeReference',
        typeName: { type: 'Identifier', name: ctor },
      }
  }
  // fallback to null
  return { type: `TSNullKeyword` }
}

function findStaticPropertyType(node: TSTypeLiteral, key: string) {
  const prop = node.members.find(
    m =>
      m.type === 'TSPropertySignature' &&
      !m.computed &&
      getId(m.key) === key &&
      m.typeAnnotation,
  )
  return prop && prop.typeAnnotation!.typeAnnotation
}

/**
 * 解析返回类型
 * 解析函数节点的返回类型
 * @param ctx 类型解析上下文
 * @param arg 函数节点
 * @param scope 类型作用域
 * @returns 解析出的返回类型节点，如果无法解析则返回undefined
 */
function resolveReturnType(
  ctx: TypeResolveContext,
  arg: Node,
  scope: TypeScope,
) {
  let resolved: Node | undefined = arg
  if (
    arg.type === 'TSTypeReference' ||
    arg.type === 'TSTypeQuery' ||
    arg.type === 'TSImportType'
  ) {
    resolved = resolveTypeReference(ctx, arg, scope)
  }
  if (!resolved) return
  if (resolved.type === 'TSFunctionType') {
    return resolved.typeAnnotation?.typeAnnotation
  }
  if (resolved.type === 'TSDeclareFunction') {
    return resolved.returnType
  }
}

/**
 * 解析联合类型
 * 将联合类型节点解析为类型节点数组
 * @param ctx 类型解析上下文
 * @param node 类型节点
 * @param scope 类型作用域
 * @returns 解析后的类型节点数组
 */
export function resolveUnionType(
  ctx: TypeResolveContext,
  node: Node & MaybeWithScope & { _resolvedElements?: ResolvedElements },
  scope?: TypeScope,
): Node[] {
  if (node.type === 'TSTypeReference') {
    const resolved = resolveTypeReference(ctx, node, scope)
    if (resolved) node = resolved
  }

  let types: Node[]
  if (node.type === 'TSUnionType') {
    types = node.types.flatMap(node => resolveUnionType(ctx, node, scope))
  } else {
    types = [node]
  }

  return types
}
