/*
 * Vue单文件组件defineEmits宏处理
 * 负责解析和处理组件中定义的事件发射
 */
import type {
  ArrayPattern,
  Identifier,
  LVal,
  Node,
  ObjectPattern,
  RestElement,
} from '@babel/types' // Babel类型定义
import { // 类型解析相关工具
 isCallOf } from './utils' // 工具函数：检查是否为特定函数调用
import type { ScriptCompileContext } from './context' // 脚本编译上下文类型
import {
  type TypeResolveContext,
  resolveTypeElements,
  resolveUnionType,
} from './resolveType' // 类型解析工具函数

/**
 * defineEmits宏的名称常量
 */
export const DEFINE_EMITS = 'defineEmits'

/**
 * 处理defineEmits调用
 * @param ctx - 脚本编译上下文
 * @param node - AST节点
 * @param declId - 声明标识符（可选）
 * @returns 是否成功处理
 */
export function processDefineEmits(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  // 检查是否为defineEmits调用
  if (!isCallOf(node, DEFINE_EMITS)) {
    return false
  }
  // 检查是否重复调用defineEmits
  if (ctx.hasDefineEmitCall) {
    // 抛出重复调用错误
    ctx.error(`duplicate ${DEFINE_EMITS}() call`, node)
  }
  // 标记已调用defineEmits
  ctx.hasDefineEmitCall = true
  // 保存运行时声明参数
  ctx.emitsRuntimeDecl = node.arguments[0]
  // 检查是否有类型参数
  if (node.typeParameters) {
    // 运行时参数和类型参数不能同时存在
    // 处理运行时声明
  if (ctx.emitsRuntimeDecl) {
      ctx.error(
        `${DEFINE_EMITS}() cannot accept both type and non-type arguments ` +
          `at the same time. Use one or the other.`,
        node,
      )
    }
    // 保存类型声明参数
    ctx.emitsTypeDecl = node.typeParameters.params[0]
  }

  // 保存声明标识符
  ctx.emitDecl = declId

  return true
}

/**
 * 生成运行时emits代码
 * @param ctx - 脚本编译上下文
 * @returns 生成的运行时代码字符串
 */
export function genRuntimeEmits(ctx: ScriptCompileContext): string | undefined {
  // 初始化emits声明字符串
  let emitsDecl = ''
  if (ctx.emitsRuntimeDecl) {
    // 获取运行时声明的源代码
    emitsDecl = ctx.getString(ctx.emitsRuntimeDecl).trim()
  // 处理类型声明
  } else if (ctx.emitsTypeDecl) {
    // 从类型声明中提取运行时emits
    const typeDeclaredEmits = extractRuntimeEmits(ctx)
    // 生成emits数组字符串
    emitsDecl = typeDeclaredEmits.size
      ? `[${Array.from(typeDeclaredEmits)
          .map(k => JSON.stringify(k))
          .join(', ')}]`
      : ``
  }
  // 处理defineModel调用相关的emits
  if (ctx.hasDefineModelCall) {
    // 生成model相关的emits声明
    let modelEmitsDecl = `[${Object.keys(ctx.modelDecls)
      .map(n => JSON.stringify(`update:${n}`))
      .join(', ')}]`
    emitsDecl = emitsDecl
      ? `/*@__PURE__*/${ctx.helper(
          'mergeModels',
        )}(${emitsDecl}, ${modelEmitsDecl})`
      : modelEmitsDecl
  }
  return emitsDecl
}

export function extractRuntimeEmits(ctx: TypeResolveContext): Set<string> {
  const emits = new Set<string>()
  const node = ctx.emitsTypeDecl!

  if (node.type === 'TSFunctionType') {
    extractEventNames(ctx, node.parameters[0], emits)
    return emits
  }

  const { props, calls } = resolveTypeElements(ctx, node)

  let hasProperty = false
  for (const key in props) {
    emits.add(key)
    hasProperty = true
  }

  if (calls) {
    if (hasProperty) {
      ctx.error(
        `defineEmits() type cannot mixed call signature and property syntax.`,
        node,
      )
    }
    for (const call of calls) {
      extractEventNames(ctx, call.parameters[0], emits)
    }
  }

  return emits
}

function extractEventNames(
  ctx: TypeResolveContext,
  eventName: ArrayPattern | Identifier | ObjectPattern | RestElement,
  emits: Set<string>,
) {
  if (
    eventName.type === 'Identifier' &&
    eventName.typeAnnotation &&
    eventName.typeAnnotation.type === 'TSTypeAnnotation'
  ) {
    const types = resolveUnionType(ctx, eventName.typeAnnotation.typeAnnotation)

    for (const type of types) {
      if (type.type === 'TSLiteralType') {
        if (
          type.literal.type !== 'UnaryExpression' &&
          type.literal.type !== 'TemplateLiteral'
        ) {
          emits.add(String(type.literal.value))
        }
      }
    }
  }
}
