// ***********************************************************************
// * v-for 指令转换处理
// * 负责处理组件中的 v-for 指令，将其转换为渲染列表的代码
// ***********************************************************************
import {
  type NodeTransform,
  type TransformContext,
  createStructuralDirectiveTransform,
} from '../transform'
import {
  type BlockCodegenNode,
  ConstantTypes,
  type DirectiveNode,
  type ElementNode,
  type ExpressionNode,
  type ForCodegenNode,
  type ForIteratorExpression,
  type ForNode,
  type ForParseResult,
  type ForRenderListExpression,
  NodeTypes,
  type PlainElementNode,
  type RenderSlotCall,
  type SimpleExpressionNode,
  type SlotOutletNode,
  type VNodeCall,
  createBlockStatement,
  createCallExpression,
  createCompoundExpression,
  createFunctionExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  createVNodeCall,
  getVNodeBlockHelper,
  getVNodeHelper,
} from '../ast'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  findDir,
  findProp,
  injectProp,
  isSlotOutlet,
  isTemplateNode,
} from '../utils'
import {
  FRAGMENT,
  IS_MEMO_SAME,
  OPEN_BLOCK,
  RENDER_LIST,
} from '../runtimeHelpers'
import { processExpression } from './transformExpression'
import { validateBrowserExpression } from '../validateExpression'
import { PatchFlags } from '@vue/shared'
import { transformBindShorthand } from './vBind'

export const transformFor: NodeTransform = createStructuralDirectiveTransform(
  'for', // 指令名称
  (node, dir, context) => {
    // node: 节点, dir: 指令, context: 转换上下文
    const { helper, removeHelper } = context
    return processFor(node, dir, context, forNode => {
      // 现在创建循环渲染函数表达式，在退出时添加迭代器
      // 所有子节点都已遍历完成后
      // iterator on exit after all children have been traversed
      const renderExp = createCallExpression(helper(RENDER_LIST), [
        forNode.source,
      ]) as ForRenderListExpression
      const isTemplate = isTemplateNode(node)
      const memo = findDir(node, 'memo')
      const keyProp = findProp(node, `key`, false, true)
      const isDirKey = keyProp && keyProp.type === NodeTypes.DIRECTIVE
      if (isDirKey && !keyProp.exp) {
        // 解析 :key 简写 #10882
        transformBindShorthand(keyProp, context)
      }
      let keyExp =
        keyProp &&
        (keyProp.type === NodeTypes.ATTRIBUTE
          ? keyProp.value
            ? createSimpleExpression(keyProp.value.content, true)
            : undefined
          : keyProp.exp)

      if (memo && keyExp && isDirKey) {
        if (!__BROWSER__) {
          keyProp.exp = keyExp = processExpression(
            keyExp as SimpleExpressionNode,
            context,
          )
        }
      }
      const keyProperty =
        keyProp && keyExp ? createObjectProperty(`key`, keyExp) : null

      if (!__BROWSER__ && isTemplate) {
        // #2085 / #5288 处理 :key 和 v-memo 表达式需要在 `<template v-for>` 上进行
        // 在这种情况下，节点被丢弃并且永远不会被遍历，因此其绑定表达式不会被正常转换处理
        // processed on `<template v-for>`. In this case the node is discarded
        // and never traversed so its binding expressions won't be processed
        // by the normal transforms.
        if (memo) {
          memo.exp = processExpression(
            memo.exp! as SimpleExpressionNode,
            context,
          )
        }
        if (keyProperty && keyProp!.type !== NodeTypes.ATTRIBUTE) {
          keyProperty.value = processExpression(
            keyProperty.value as SimpleExpressionNode,
            context,
          )
        }
      }

      const isStableFragment =
        forNode.source.type === NodeTypes.SIMPLE_EXPRESSION &&
        forNode.source.constType > ConstantTypes.NOT_CONSTANT
      const fragmentFlag = isStableFragment
        ? PatchFlags.STABLE_FRAGMENT
        : keyProp
          ? PatchFlags.KEYED_FRAGMENT
          : PatchFlags.UNKEYED_FRAGMENT

      forNode.codegenNode = createVNodeCall(
        context,
        helper(FRAGMENT),
        undefined,
        renderExp,
        fragmentFlag,
        undefined,
        undefined,
        true /* isBlock */,
        !isStableFragment /* disableTracking */,
        false /* isComponent */,
        node.loc,
      ) as ForCodegenNode

      return () => {
        // finish the codegen now that all children have been traversed
        let childBlock: BlockCodegenNode
        const { children } = forNode

        // 检查 <template v-for> 的 key 放置位置
        if ((__DEV__ || !__BROWSER__) && isTemplate) {
          node.children.some(c => {
            if (c.type === NodeTypes.ELEMENT) {
              const key = findProp(c, 'key')
              if (key) {
                context.onError(
                  createCompilerError(
                    ErrorCodes.X_V_FOR_TEMPLATE_KEY_PLACEMENT,
                    key.loc,
                  ),
                )
                return true
              }
            }
          })
        }

        const needFragmentWrapper =
          children.length !== 1 || children[0].type !== NodeTypes.ELEMENT
        const slotOutlet = isSlotOutlet(node)
          ? node
          : isTemplate &&
              node.children.length === 1 &&
              isSlotOutlet(node.children[0])
            ? (node.children[0] as SlotOutletNode) // api-extractor somehow fails to infer this
            : null

        if (slotOutlet) {
          // <slot v-for="..."> 或 <template v-for="..."><slot/></template> 的情况
          childBlock = slotOutlet.codegenNode as RenderSlotCall
          if (isTemplate && keyProperty) {
            // <template v-for="..." :key="..."><slot/></template>
            // we need to inject the key to the renderSlot() call.
            // renderSlot 的 props 作为第三个参数传递
            injectProp(childBlock, keyProperty, context)
          }
        } else if (needFragmentWrapper) {
          // <template v-for="..."> 包含文本或多个元素的情况
          // should generate a fragment block for each loop
          childBlock = createVNodeCall(
            context,
            helper(FRAGMENT),
            keyProperty ? createObjectExpression([keyProperty]) : undefined,
            node.children,
            PatchFlags.STABLE_FRAGMENT,
            undefined,
            undefined,
            true,
            undefined,
            false /* isComponent */,
          )
        } else {
          // 普通元素的 v-for。直接使用子节点的 codegenNode
          // but mark it as a block.
          childBlock = (children[0] as PlainElementNode)
            .codegenNode as VNodeCall
          if (isTemplate && keyProperty) {
            injectProp(childBlock, keyProperty, context)
          }
          if (childBlock.isBlock !== !isStableFragment) {
            if (childBlock.isBlock) {
              // 从块切换到虚拟节点
              removeHelper(OPEN_BLOCK)
              removeHelper(
                getVNodeBlockHelper(context.inSSR, childBlock.isComponent),
              )
            } else {
              // 从虚拟节点切换到块
              removeHelper(
                getVNodeHelper(context.inSSR, childBlock.isComponent),
              )
            }
          }
          childBlock.isBlock = !isStableFragment
          if (childBlock.isBlock) {
            helper(OPEN_BLOCK)
            helper(getVNodeBlockHelper(context.inSSR, childBlock.isComponent))
          } else {
            helper(getVNodeHelper(context.inSSR, childBlock.isComponent))
          }
        }

        if (memo) {
          const loop = createFunctionExpression(
            createForLoopParams(forNode.parseResult, [
              createSimpleExpression(`_cached`),
            ]),
          )
          loop.body = createBlockStatement([
            createCompoundExpression([`const _memo = (`, memo.exp!, `)`]),
            createCompoundExpression([
              `if (_cached`,
              ...(keyExp ? [` && _cached.key === `, keyExp] : []),
              ` && ${context.helperString(
                IS_MEMO_SAME,
              )}(_cached, _memo)) return _cached`,
            ]),
            createCompoundExpression([`const _item = `, childBlock as any]),
            createSimpleExpression(`_item.memo = _memo`),
            createSimpleExpression(`return _item`),
          ])
          renderExp.arguments.push(
            loop as ForIteratorExpression,
            createSimpleExpression(`_cache`),
            createSimpleExpression(String(context.cached.length)),
          )
          // 增加缓存计数
          context.cached.push(null)
        } else {
          renderExp.arguments.push(
            createFunctionExpression(
              createForLoopParams(forNode.parseResult),
              childBlock,
              true /* force newline */,
            ) as ForIteratorExpression,
          )
        }
      }
    })
  },
)

// 与目标无关的转换，同时用于客户端和 SSR
/**
 * 处理 v-for 指令的核心函数
 * @param node 元素节点
 * @param dir 指令节点
 * @param context 转换上下文
 * @param processCodegen 代码生成处理函数
 * @returns 清理函数，在子节点处理完成后执行
 */
export function processFor(
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
  processCodegen?: (forNode: ForNode) => (() => void) | undefined,
): (() => void) | undefined {
  if (!dir.exp) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_FOR_NO_EXPRESSION, dir.loc),
    )
    return
  }

  const parseResult = dir.forParseResult

  if (!parseResult) {
    context.onError(
      createCompilerError(ErrorCodes.X_V_FOR_MALFORMED_EXPRESSION, dir.loc),
    )
    return
  }

  finalizeForParseResult(parseResult, context)

  const { addIdentifiers, removeIdentifiers, scopes } = context
  const { source, value, key, index } = parseResult

  const forNode: ForNode = {
    type: NodeTypes.FOR,
    loc: dir.loc,
    source,
    valueAlias: value,
    keyAlias: key,
    objectIndexAlias: index,
    parseResult,
    children: isTemplateNode(node) ? node.children : [node],
  }

  context.replaceNode(forNode)

  // 记录作用域信息
  scopes.vFor++
  if (!__BROWSER__ && context.prefixIdentifiers) {
    // scope management
    // 注入标识符到上下文中
    value && addIdentifiers(value)
    key && addIdentifiers(key)
    index && addIdentifiers(index)
  }

  const onExit = processCodegen && processCodegen(forNode)

  return (): void => {
    scopes.vFor--
    if (!__BROWSER__ && context.prefixIdentifiers) {
      value && removeIdentifiers(value)
      key && removeIdentifiers(key)
      index && removeIdentifiers(index)
    }
    if (onExit) onExit()
  }
}

/**
 * 完成 for 解析结果的处理
 * @param result 解析结果
 * @param context 转换上下文
 */
export function finalizeForParseResult(
  result: ForParseResult,
  context: TransformContext,
): void {
  if (result.finalized) return

  if (!__BROWSER__ && context.prefixIdentifiers) {
    result.source = processExpression(
      result.source as SimpleExpressionNode,
      context,
    )
    if (result.key) {
      result.key = processExpression(
        result.key as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.index) {
      result.index = processExpression(
        result.index as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.value) {
      result.value = processExpression(
        result.value as SimpleExpressionNode,
        context,
        true,
      )
    }
  }
  if (__DEV__ && __BROWSER__) {
    validateBrowserExpression(result.source as SimpleExpressionNode, context)
    if (result.key) {
      validateBrowserExpression(
        result.key as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.index) {
      validateBrowserExpression(
        result.index as SimpleExpressionNode,
        context,
        true,
      )
    }
    if (result.value) {
      validateBrowserExpression(
        result.value as SimpleExpressionNode,
        context,
        true,
      )
    }
  }
  result.finalized = true
}

/**
 * 创建 for 循环参数
 * @param param0 解析结果
 * @param memoArgs 记忆参数
 * @returns 参数表达式数组
 */
export function createForLoopParams(
  { value, key, index }: ForParseResult,
  memoArgs: ExpressionNode[] = [],
): ExpressionNode[] {
  return createParamsList([value, key, index, ...memoArgs])
}

/**
 * 创建参数列表
 * @param args 参数数组
 * @returns 处理后的参数列表
 */
function createParamsList(
  args: (ExpressionNode | undefined)[],
): ExpressionNode[] {
  // 初始化索引为参数数组的长度
  let i = args.length
  // 反向迭代以找到最后一个非undefined的参数
  while (i--) {
    if (args[i]) break
  }
  // 截取参数数组到最后一个有效参数的位置
  return (
    args
      .slice(0, i + 1)
      // 替换undefined参数为占位符变量（_、__、___等）
      .map((arg, i) => arg || createSimpleExpression(`_`.repeat(i + 1), false))
  )
}
