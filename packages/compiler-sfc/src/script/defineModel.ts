/*
 * Vue单文件组件defineModel宏处理
 * 负责解析和处理SFC中的defineModel调用，生成对应的模型声明
 */

// 导入Babel类型定义
import type { LVal, Node, TSType } from '@babel/types'
// 导入脚本编译上下文类型
import type { ScriptCompileContext } from './context'
// 导入运行时类型推断函数
import { inferRuntimeType } from './resolveType'
// 导入工具函数和常量
import { UNKNOWN_TYPE, isCallOf, toRuntimeTypeString } from './utils'
// 导入绑定类型和TS节点解包工具
import { BindingTypes, unwrapTSNode } from '@vue/compiler-dom'

/**
 * defineModel宏的函数名常量
 */
export const DEFINE_MODEL = 'defineModel'

/**
 * 模型声明接口
 */
export interface ModelDecl {
  /** 模型类型 */
  type: TSType | undefined
  /** 模型选项 */
  options: string | undefined
  /** 标识符名称 */
  identifier: string | undefined
  /** 运行时选项节点 */
  runtimeOptionNodes: Node[]
}

/**
 * 处理defineModel宏调用
 * @param ctx - 脚本编译上下文
 * @param node - 当前AST节点
 * @param declId - 声明标识符（可选）
 * @returns 是否成功处理了defineModel调用
 */
export function processDefineModel(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  // 检查是否是defineModel函数调用
  if (!isCallOf(node, DEFINE_MODEL)) {
    return false
  }

  // 标记已调用defineModel
  ctx.hasDefineModelCall = true

  // 提取类型参数
  const type = 
    (node.typeParameters && node.typeParameters.params[0]) || undefined
  let modelName: string
  let options: Node | undefined
  // 获取第一个参数并解包TS节点
  const arg0 = node.arguments[0] && unwrapTSNode(node.arguments[0])
  // 检查是否提供了模型名称
  const hasName = arg0 && arg0.type === 'StringLiteral'
  if (hasName) {
    // 使用提供的模型名称
    modelName = arg0.value
    options = node.arguments[1]
  } else {
    // 使用默认模型名称
    modelName = 'modelValue'
    options = arg0
  }

  // 检查模型名称是否重复
  if (ctx.modelDecls[modelName]) {
    ctx.error(`duplicate model name ${JSON.stringify(modelName)}`, node)
  }

  // 获取选项字符串
  let optionsString = options && ctx.getString(options)
  // 标记选项是否被移除
  let optionsRemoved = !options
  // 存储运行时选项节点
  const runtimeOptionNodes: Node[] = []

  // 处理对象类型的选项
  if (
    options &&
    options.type === 'ObjectExpression' &&
    !options.properties.some(p => p.type === 'SpreadElement' || p.computed)
  ) {
    let removed = 0
    // 从后向前遍历属性，避免索引问题
    for (let i = options.properties.length - 1; i >= 0; i--) {
      const p = options.properties[i]
      const next = options.properties[i + 1]
      const start = p.start!
      const end = next ? next.start! : options.end! - 1
      // 检查是否是get或set方法
      if (
        (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
        ((p.key.type === 'Identifier' &&
          (p.key.name === 'get' || p.key.name === 'set')) ||
          (p.key.type === 'StringLiteral' &&
            (p.key.value === 'get' || p.key.value === 'set')))
      ) {
        // 从prop选项中移除仅运行时的选项，避免重复
        optionsString = 
          optionsString.slice(0, start - options.start!) +
          optionsString.slice(end - options.start!)
      } else {
        // 从运行时选项中移除prop选项
        removed++
        ctx.s.remove(ctx.startOffset! + start, ctx.startOffset! + end)
        // 记录prop选项，用于无效作用域变量引用检查
        runtimeOptionNodes.push(p)
      }
    }
    // 如果所有属性都被移除，则完全移除选项
    if (removed === options.properties.length) {
      optionsRemoved = true
      ctx.s.remove(
        ctx.startOffset! + (hasName ? arg0.end! : options.start!),
        ctx.startOffset! + options.end!
      )
    }
  }

  // 创建并存储模型声明
  ctx.modelDecls[modelName] = {
    type,
    options: optionsString,
    runtimeOptionNodes,
    identifier: 
      declId && declId.type === 'Identifier' ? declId.name : undefined,
  }
  // 注册绑定类型
  ctx.bindingMetadata[modelName] = BindingTypes.PROPS

  // 将defineModel替换为useModel
  ctx.s.overwrite(
    ctx.startOffset! + node.callee.start!,
    ctx.startOffset! + node.callee.end!,
    ctx.helper('useModel'),
  )
  // inject arguments
  ctx.s.appendLeft(
    ctx.startOffset! +
      (node.arguments.length ? node.arguments[0].start! : node.end! - 1),
    `__props, ` +
      (hasName
        ? ``
        : `${JSON.stringify(modelName)}${optionsRemoved ? `` : `, `}`),
  )

  return true
}

export function genModelProps(ctx: ScriptCompileContext) {
  if (!ctx.hasDefineModelCall) return

  const isProd = !!ctx.options.isProd
  let modelPropsDecl = ''
  for (const [name, { type, options: runtimeOptions }] of Object.entries(
    ctx.modelDecls,
  )) {
    let skipCheck = false
    let codegenOptions = ``
    let runtimeTypes = type && inferRuntimeType(ctx, type)
    if (runtimeTypes) {
      const hasBoolean = runtimeTypes.includes('Boolean')
      const hasFunction = runtimeTypes.includes('Function')
      const hasUnknownType = runtimeTypes.includes(UNKNOWN_TYPE)

      if (hasUnknownType) {
        if (hasBoolean || hasFunction) {
          runtimeTypes = runtimeTypes.filter(t => t !== UNKNOWN_TYPE)
          skipCheck = true
        } else {
          runtimeTypes = ['null']
        }
      }

      if (!isProd) {
        codegenOptions =
          `type: ${toRuntimeTypeString(runtimeTypes)}` +
          (skipCheck ? ', skipCheck: true' : '')
      } else if (hasBoolean || (runtimeOptions && hasFunction)) {
        // preserve types if contains boolean, or
        // function w/ runtime options that may contain default
        codegenOptions = `type: ${toRuntimeTypeString(runtimeTypes)}`
      } else {
        // able to drop types in production
      }
    }

    let decl: string
    if (codegenOptions && runtimeOptions) {
      decl = ctx.isTS
        ? `{ ${codegenOptions}, ...${runtimeOptions} }`
        : `Object.assign({ ${codegenOptions} }, ${runtimeOptions})`
    } else if (codegenOptions) {
      decl = `{ ${codegenOptions} }`
    } else if (runtimeOptions) {
      decl = runtimeOptions
    } else {
      decl = `{}`
    }
    modelPropsDecl += `\n    ${JSON.stringify(name)}: ${decl},`

    // also generate modifiers prop
    const modifierPropName = JSON.stringify(
      name === 'modelValue' ? `modelModifiers` : `${name}Modifiers`,
    )
    modelPropsDecl += `\n    ${modifierPropName}: {},`
  }
  return `{${modelPropsDecl}\n  }`
}
