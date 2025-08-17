/**
 * v-on 指令转换处理
 * 此文件负责处理 Vue 模板中 v-on 指令的转换逻辑
 */
import type { DirectiveTransform, DirectiveTransformResult } from '../transform'
import {
  type DirectiveNode,
  ElementTypes,
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  createCompoundExpression,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { camelize, toHandlerKey } from '@vue/shared'
import { ErrorCodes, createCompilerError } from '../errors'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { hasScopeRef, isFnExpression, isMemberExpression } from '../utils'
import { TO_HANDLER_KEY } from '../runtimeHelpers'

/**
 * v-on 指令节点接口
 * 扩展自 DirectiveNode，用于表示带有参数的 v-on 指令
 * @property arg - 指令参数（事件名）
 * @property exp - 指令表达式（事件处理函数）
 * 注意：无参数的 v-on 指令在 ./transformElement.ts 中直接处理
 */
export interface VOnDirectiveNode extends DirectiveNode {
  arg: ExpressionNode
  exp: SimpleExpressionNode | undefined
}

/**
 * v-on 指令转换函数
 * 将 v-on 指令转换为相应的属性对象
 * @param dir - v-on 指令节点
 * @param node - 包含指令的元素节点
 * @param context - 转换上下文
 * @param augmentor - 扩展编译器的增强函数
 * @returns 转换结果，包含生成的属性对象
 */
export const transformOn: DirectiveTransform = (
  dir,
  node,
  context,
  augmentor,
) => {
  const { loc, modifiers, arg } = dir as VOnDirectiveNode
  // 检查是否缺少表达式且没有修饰符
  if (!dir.exp && !modifiers.length) {
    context.onError(createCompilerError(ErrorCodes.X_V_ON_NO_EXPRESSION, loc))
  }
  let eventName: ExpressionNode
  // 处理事件名
  if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
    if (arg.isStatic) {
      let rawName = arg.content
      // 开发环境下检查是否使用了 vnode 钩子
      if (__DEV__ && rawName.startsWith('vnode')) {
        context.onError(createCompilerError(ErrorCodes.X_VNODE_HOOKS, arg.loc))
      }
      // 处理 vue: 前缀的事件名
      if (rawName.startsWith('vue:')) {
        rawName = `vnode-${rawName.slice(4)}`
      }
      // 构建事件字符串
      const eventString =
        node.tagType !== ElementTypes.ELEMENT ||
        rawName.startsWith('vnode') ||
        !/[A-Z]/.test(rawName)
          ? // 对于非元素节点和 vnode 生命周期事件监听器，自动转换为驼峰式
            toHandlerKey(camelize(rawName))
          : // 对于包含大写字母的普通元素监听器，保留原始大小写
            `on:${rawName}`
      eventName = createSimpleExpression(eventString, true, arg.loc)
    } else {
      // 动态事件名，使用 TO_HANDLER_KEY 辅助函数处理
      eventName = createCompoundExpression([
        `${context.helperString(TO_HANDLER_KEY)}(`,
        arg,
        `)`,
      ])
    }
  } else {
    // 已经是复合表达式，直接添加 TO_HANDLER_KEY 辅助函数
    eventName = arg
    eventName.children.unshift(`${context.helperString(TO_HANDLER_KEY)}(`)
    eventName.children.push(`)`)
  }

  // 处理事件处理函数
  let exp: ExpressionNode | undefined = dir.exp as
    | SimpleExpressionNode
    | undefined
  // 空表达式处理
  if (exp && !exp.content.trim()) {
    exp = undefined
  }
  // 初始化是否应该缓存处理函数的标志
  let shouldCache: boolean = context.cacheHandlers && !exp && !context.inVOnce
  if (exp) {
    const isMemberExp = isMemberExpression(exp, context)
    const isInlineStatement = !(isMemberExp || isFnExpression(exp, context))
    const hasMultipleStatements = exp.content.includes(`;`) // 是否包含多个语句

    // 处理表达式（之前被跳过了）
    if (!__BROWSER__ && context.prefixIdentifiers) {
      isInlineStatement && context.addIdentifiers(`$event`)
      exp = dir.exp = processExpression(
        exp,
        context,
        false,
        hasMultipleStatements,
      )
      isInlineStatement && context.removeIdentifiers(`$event`)
      // 根据作用域分析，如果函数没有引用作用域变量，则可以被提升
      shouldCache =
        context.cacheHandlers &&
        // v-once 内部不需要缓存
        !context.inVOnce &&
        // 运行时常量不需要缓存
        !(exp.type === NodeTypes.SIMPLE_EXPRESSION && exp.constType > 0) &&
        // 组件上的成员表达式处理函数不需要缓存，以保留函数参数数量
        // 例如 <transition> 依赖检查 cb.length 来确定过渡结束处理
        !(isMemberExp && node.tagType === ElementTypes.COMPONENT) &&
        // 如果函数引用了闭包变量(v-for, v-slot)，不需要缓存
        // 必须传递新函数以避免过时的值
        !hasScopeRef(exp, context.identifiers)
      // 如果表达式可优化且是指向函数的成员表达式，将其转换为调用形式
      // 这样在调用时总是访问最新值，从而避免需要补丁
      if (shouldCache && isMemberExp) {
        if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
          exp.content = `${exp.content} && ${exp.content}(...args)`
        } else {
          exp.children = [...exp.children, ` && `, ...exp.children, `(...args)`]
        }
      }
    }

    // 开发环境下在浏览器中验证表达式
    if (__DEV__ && __BROWSER__) {
      validateBrowserExpression(
        exp as SimpleExpressionNode,
        context,
        false,
        hasMultipleStatements,
      )
    }

    // 将内联语句或需要缓存的成员表达式包装为函数表达式
    if (isInlineStatement || (shouldCache && isMemberExp)) {
      exp = createCompoundExpression([
        `${
          isInlineStatement
            ? !__BROWSER__ && context.isTS
              ? `($event: any)` // TypeScript 环境下添加类型注解
              : `$event` // JavaScript 环境下直接使用 $event
            : `${
                !__BROWSER__ && context.isTS ? `\n//@ts-ignore\n` : ``
              }(...args)` // 成员表达式使用 ...args
        } => ${hasMultipleStatements ? `{` : `(`}`, // 多语句用 {}，单语句用 ()
        exp,
        hasMultipleStatements ? `}` : `)`,
      ])
    }
  }

  // 构建转换结果
  let ret: DirectiveTransformResult = {
    props: [
      createObjectProperty(
        eventName,
        exp || createSimpleExpression(`() => {}`, false, loc), // 如果没有表达式，提供空函数
      ),
    ],
  }

  // 应用扩展编译器的增强函数
  if (augmentor) {
    ret = augmentor(ret)
  }

  // 如果需要缓存，缓存处理函数
  if (shouldCache) {
    // 缓存处理函数，确保总是传递相同的处理函数
    // 这避免了用户在组件上使用内联处理函数时的不必要重新渲染
    ret.props[0].value = context.cache(ret.props[0].value)
  }

  // 标记键为处理函数，用于属性规范化检查
  ret.props.forEach(p => (p.key.isHandlerKey = true))
  return ret
}
