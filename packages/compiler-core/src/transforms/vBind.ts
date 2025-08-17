/**
 * v-bind 指令转换处理
 * 该文件实现了 v-bind 指令的转换逻辑，用于将模板中的属性绑定转换为渲染函数代码
 */
import type { DirectiveTransform, TransformContext } from '../transform'
import {
  type DirectiveNode,
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  createObjectProperty,
  createSimpleExpression,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import { camelize } from '@vue/shared'
import { CAMELIZE } from '../runtimeHelpers'
import { processExpression } from './transformExpression'

/**
 * v-bind 指令转换函数
 * 注意：不带参数的 v-bind 由 ./transformElement.ts 直接处理，因为它会影响整个 props 对象的代码生成
 * 此转换函数仅处理带参数的 v-bind
 * @param {DirectiveNode} dir - 指令节点
 * @param {object} _node - 当前节点（未使用）
 * @param {TransformContext} context - 转换上下文
 * @returns {{ props: Array<object> }} - 包含生成的属性对象的数组
 */
export const transformBind: DirectiveTransform = (dir, _node, context) => {
  // 解构指令节点属性
  const { modifiers, loc } = dir
  // 获取指令参数
  const arg = dir.arg!

  // 获取表达式
  let { exp } = dir

  // 处理空表达式
  if (exp && exp.type === NodeTypes.SIMPLE_EXPRESSION && !exp.content.trim()) {
    if (!__BROWSER__) {
        // #10280 仅在非浏览器构建中对空表达式报错
        // 因为在DOM模板中，:foo会被浏览器解析为:foo=""
        context.onError(
          createCompilerError(ErrorCodes.X_V_BIND_NO_EXPRESSION, loc),
        )
        return {
          props: [
            createObjectProperty(arg, createSimpleExpression('', true, loc)),
          ],
        }
      } else {
        // 浏览器环境下将表达式设为undefined
        exp = undefined
      }
    }

    // 同名简写语法 - :arg 会被扩展为 :arg="arg"
    if (!exp) {
    if (arg.type !== NodeTypes.SIMPLE_EXPRESSION || !arg.isStatic) {
        // 同名简写仅允许简单表达式
        context.onError(
          createCompilerError(
            ErrorCodes.X_V_BIND_INVALID_SAME_NAME_ARGUMENT,
            arg.loc,
          ),
        )
        return {
          props: [
            createObjectProperty(arg, createSimpleExpression('', true, loc)),
          ],
        }
      }

      // 处理同名简写
      transformBindShorthand(dir, context)
      exp = dir.exp!
    }

    // 处理动态参数
    if (arg.type !== NodeTypes.SIMPLE_EXPRESSION) {
      arg.children.unshift(`(`)
      arg.children.push(`) || ""`)
    } else if (!arg.isStatic) {
      // 确保非静态参数有默认值
      arg.content = arg.content ? `${arg.content} || ""` : `""`
    }

  // .sync 修饰符已被 v-model:arg 替代

    // 处理 .camel 修饰符 - 将属性名转换为驼峰式命名
    if (modifiers.some(mod => mod.content === 'camel')) {
      if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
        if (arg.isStatic) {
          // 静态参数直接转换
          arg.content = camelize(arg.content)
        } else {
          // 动态参数使用 CAMELIZE 运行时辅助函数
          arg.content = `${context.helperString(CAMELIZE)}(${arg.content})`
        }
      } else {
        // 复合表达式添加 CAMELIZE 辅助函数调用
        arg.children.unshift(`${context.helperString(CAMELIZE)}(`)
        arg.children.push(`)`)
      }
    }

  // 非 SSR 环境处理
    if (!context.inSSR) {
      // .prop 修饰符 - 将属性绑定为 DOM 属性而非 HTML 属性
      if (modifiers.some(mod => mod.content === 'prop')) {
        injectPrefix(arg, '.')
      }
      // .attr 修饰符 - 强制将属性绑定为 HTML 属性
      if (modifiers.some(mod => mod.content === 'attr')) {
        injectPrefix(arg, '^')
      }
    }

  return {
    props: [createObjectProperty(arg, exp)],
  }
}

/**
 * 处理 v-bind 同名简写
 * @param {DirectiveNode} dir - 指令节点
 * @param {TransformContext} context - 转换上下文
 */
export const transformBindShorthand = (
  dir: DirectiveNode,
  context: TransformContext,
): void => {
  const arg = dir.arg!

  // 将参数名转换为驼峰式，并创建表达式
  const propName = camelize((arg as SimpleExpressionNode).content)
  dir.exp = createSimpleExpression(propName, false, arg.loc)
  // 非浏览器环境处理表达式
  if (!__BROWSER__) {
    dir.exp = processExpression(dir.exp, context)
  }
}

/**
 * 为属性名添加前缀
 * @param {ExpressionNode} arg - 表达式节点
 * @param {string} prefix - 要添加的前缀
 */
const injectPrefix = (arg: ExpressionNode, prefix: string) => {
  if (arg.type === NodeTypes.SIMPLE_EXPRESSION) {
    if (arg.isStatic) {
      // 静态表达式直接添加前缀
      arg.content = prefix + arg.content
    } else {
      // 动态表达式使用模板字符串添加前缀
      arg.content = `\`${prefix}\${${arg.content}}\``
    }
  } else {
    // 复合表达式添加前缀
    arg.children.unshift(`'${prefix}' + (`)
    arg.children.push(`)`)
  }
}
