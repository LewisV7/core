/**
 * @file vOn.ts
 * @description 处理v-on指令的转换逻辑
 * 该模块实现了对Vue中v-on指令的编译转换，包括事件绑定、修饰符处理和兼容性支持
 * 将模板中的v-on指令转换为DOM元素的事件监听代码
 */
import {
  CompilerDeprecationTypes,
  type DirectiveTransform,
  type ExpressionNode,
  NodeTypes,
  type SimpleExpressionNode,
  type SourceLocation,
  type TransformContext,
  transformOn as baseTransform,
  checkCompatEnabled,
  createCallExpression,
  createCompoundExpression,
  createObjectProperty,
  createSimpleExpression,
  isStaticExp,
} from '@vue/compiler-core'
import { V_ON_WITH_KEYS, V_ON_WITH_MODIFIERS } from '../runtimeHelpers'
import { capitalize, makeMap } from '@vue/shared'

// 事件选项修饰符：用于addEventListener()的选项
const isEventOptionModifier = /*@__PURE__*/ makeMap(`passive,once,capture`)

// 非键盘修饰符
const isNonKeyModifier = /*@__PURE__*/ makeMap(
    // 事件传播管理
    `stop,prevent,self,` +
        // 系统修饰符 + exact
        `ctrl,shift,alt,meta,exact,` +
        // 鼠标修饰符
        `middle`,
)

// 可能的键盘修饰符：根据事件类型可能是鼠标或键盘修饰符
const maybeKeyModifier = /*@__PURE__*/ makeMap('left,right')

// 键盘事件：判断是否为键盘相关事件
const isKeyboardEvent = /*@__PURE__*/ makeMap(`onkeyup,onkeydown,onkeypress`)

/**
 * @function resolveModifiers
 * @description 解析v-on指令中的事件修饰符
 * @param {ExpressionNode} key - 事件键表达式
 * @param {SimpleExpressionNode[]} modifiers - 修饰符数组
 * @param {TransformContext} context - 转换上下文
 * @param {SourceLocation} loc - 源代码位置信息
 * @returns {{keyModifiers: string[], nonKeyModifiers: string[], eventOptionModifiers: string[]}} - 分类后的修饰符对象
 */
const resolveModifiers = (
    key: ExpressionNode,
    modifiers: SimpleExpressionNode[],
    context: TransformContext,
    loc: SourceLocation,
) => {
    // 初始化修饰符分类数组
    const keyModifiers = []          // 键盘修饰符
    const nonKeyModifiers = []       // 非键盘修饰符
    const eventOptionModifiers = []  // 事件选项修饰符

    // 遍历所有修饰符
    for (let i = 0; i < modifiers.length; i++) {
        const modifier = modifiers[i].content

        // 处理兼容性相关的native修饰符
        if (
            __COMPAT__ &&
            modifier === 'native' &&
            checkCompatEnabled(
                CompilerDeprecationTypes.COMPILER_V_ON_NATIVE,
                context,
                loc,
            )
        ) {
            eventOptionModifiers.push(modifier)
        } else if (isEventOptionModifier(modifier)) {
            // 事件选项修饰符：用于addEventListener()选项，如.passive和.capture
            eventOptionModifiers.push(modifier)
        } else {
            // 运行时修饰符：需要运行时守卫的修饰符
            if (maybeKeyModifier(modifier)) {
                // 可能是键盘修饰符的情况
                if (isStaticExp(key)) {
                    // 如果事件键是静态的
                    if (
                        isKeyboardEvent((key as SimpleExpressionNode).content.toLowerCase())
                    ) {
                        // 如果是键盘事件，添加到键盘修饰符
                        keyModifiers.push(modifier)
                    } else {
                        // 否则添加到非键盘修饰符
                        nonKeyModifiers.push(modifier)
                    }
                } else {
                    // 如果事件键是动态的，同时添加到两种修饰符
                    keyModifiers.push(modifier)
                    nonKeyModifiers.push(modifier)
                }
            } else {
                // 明确的非键盘或键盘修饰符
                if (isNonKeyModifier(modifier)) {
                    nonKeyModifiers.push(modifier)
                } else {
                    keyModifiers.push(modifier)
                }
            }
        }
    }

    // 返回分类后的修饰符
    return {
        keyModifiers,
        nonKeyModifiers,
        eventOptionModifiers,
    }
}

/**
 * @function transformClick
 * @description 转换点击事件处理逻辑
 * 将click事件转换为指定的目标事件类型（如contextmenu或mouseup）
 * @param {ExpressionNode} key - 事件键表达式
 * @param {string} event - 目标事件名称
 * @returns {ExpressionNode} - 转换后的事件表达式
 */
const transformClick = (key: ExpressionNode, event: string) => {
    // 检查是否为静态点击事件
    const isStaticClick = isStaticExp(key) && key.content.toLowerCase() === 'onclick'
    
    // 根据事件类型返回不同的表达式
    return isStaticClick
      // 如果是静态点击事件，直接返回目标事件
      ? createSimpleExpression(event, true)
      // 如果不是静态点击事件，检查是否为复杂表达式
      : key.type !== NodeTypes.SIMPLE_EXPRESSION
        // 处理复杂表达式情况：创建条件表达式
        ? createCompoundExpression([
            `(`,          // 开始条件判断
            key,          // 事件键
            `) === "onClick" ? "${event}" : (`,  // 如果是onClick事件则替换为目标事件
            key,          // 否则返回原事件键
            `)`,          // 结束条件判断
          ])
        // 如果是简单表达式但不是点击事件，返回原事件键
        : key
}

/**
 * @function transformOn
 * @description v-on指令的转换处理函数
 * 处理DOM元素上的v-on指令，包括修饰符解析、事件转换和兼容性支持
 * @param {DirectiveNode} dir - 指令节点
 * @param {ElementNode} node - 元素节点
 * @param {TransformContext} context - 转换上下文
 * @returns {TransformResult} - 转换结果
 */
export const transformOn: DirectiveTransform = (dir, node, context) => {
  return baseTransform(dir, node, context, baseResult => {
    const { modifiers } = dir
    if (!modifiers.length) return baseResult

    let { key, value: handlerExp } = baseResult.props[0]
    const { keyModifiers, nonKeyModifiers, eventOptionModifiers } =
      resolveModifiers(key, modifiers, context, dir.loc)

    // normalize click.right and click.middle since they don't actually fire
    if (nonKeyModifiers.includes('right')) {
      key = transformClick(key, `onContextmenu`)
    }
    if (nonKeyModifiers.includes('middle')) {
      key = transformClick(key, `onMouseup`)
    }

    if (nonKeyModifiers.length) {
      handlerExp = createCallExpression(context.helper(V_ON_WITH_MODIFIERS), [
        handlerExp,
        JSON.stringify(nonKeyModifiers),
      ])
    }

    if (
      keyModifiers.length &&
      // if event name is dynamic, always wrap with keys guard
      (!isStaticExp(key) || isKeyboardEvent(key.content.toLowerCase()))
    ) {
      handlerExp = createCallExpression(context.helper(V_ON_WITH_KEYS), [
        handlerExp,
        JSON.stringify(keyModifiers),
      ])
    }

    if (eventOptionModifiers.length) {
      const modifierPostfix = eventOptionModifiers.map(capitalize).join('')
      key = isStaticExp(key)
        ? createSimpleExpression(`${key.content}${modifierPostfix}`, true)
        : createCompoundExpression([`(`, key, `) + "${modifierPostfix}"`])
    }

    return {
      props: [createObjectProperty(key, handlerExp)],
    }
  })
}
