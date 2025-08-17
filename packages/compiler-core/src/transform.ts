/**
 * Vue编译器核心 - 转换模块
 * 负责将解析生成的AST(抽象语法树)转换为可执行的JavaScript代码
 * 主要功能包括：
 * - 节点转换(NodeTransform)
 * - 指令转换(DirectiveTransform)
 * - 静态节点提升
 * - 辅助函数处理
 * - 作用域管理
 */
import type { TransformOptions } from './options'
import {
  type ArrayExpression,
  type CacheExpression,
  ConstantTypes,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type JSChildNode,
  NodeTypes,
  type ParentNode,
  type Property,
  type RootNode,
  type SimpleExpressionNode,
  type TemplateChildNode,
  type TemplateLiteral,
  convertToBlock,
  createCacheExpression,
  createSimpleExpression,
  createVNodeCall,
} from './ast'
import {
  EMPTY_OBJ,
  NOOP,
  PatchFlags,
  camelize,
  capitalize,
  isArray,
  isString,
} from '@vue/shared'
import { defaultOnError, defaultOnWarn } from './errors'
import {
  CREATE_COMMENT,
  FRAGMENT,
  TO_DISPLAY_STRING,
  helperNameMap,
} from './runtimeHelpers'
import { isVSlot } from './utils'
import { cacheStatic, getSingleElementRoot } from './transforms/cacheStatic'
import type { CompilerCompatOptions } from './compat/compatConfig'

// There are two types of transforms:
//
/**
 * 节点转换函数类型
 * 直接操作AST节点的转换函数
 * 可以修改、替换或删除正在处理的节点
 * @param node - 要处理的AST节点
 * @param context - 转换上下文
 * @returns 可选的清理函数或清理函数数组
 */
export type NodeTransform = (
  node: RootNode | TemplateChildNode,
  context: TransformContext,
) => void | (() => void) | (() => void)[]

/**
 * 指令转换函数类型
 * 处理元素上的单个指令属性
 * 将原始指令转换为VNode的实际属性
 * @param dir - 指令节点
 * @param node - 包含指令的元素节点
 * @param context - 转换上下文
 * @param augmentor - 可选的增强器函数，用于增强转换结果
 * @returns 指令转换结果
 */
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
  // a platform specific compiler can import the base transform and augment
  // it by passing in this optional argument.
  augmentor?: (ret: DirectiveTransformResult) => DirectiveTransformResult,
) => DirectiveTransformResult

/**
 * 指令转换结果接口
 * 包含指令转换后的属性和其他相关信息
 */
export interface DirectiveTransformResult {
  /** 转换后的属性数组 */
  props: Property[]
  /** 是否需要运行时支持 */
  needRuntime?: boolean | symbol
  /** SSR环境下的标签部分 */
  ssrTagParts?: TemplateLiteral['elements']
}

/**
 * 结构型指令转换函数类型
 * 技术上也是一种NodeTransform，但专门用于处理结构型指令
 * 只有v-if和v-for属于这一类别
 * @param node - 包含结构型指令的元素节点
 * @param dir - 结构型指令节点
 * @param context - 转换上下文
 * @returns 可选的清理函数
 */
export type StructuralDirectiveTransform = (
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
) => void | (() => void)

/**
 * 导入项接口
 * 表示需要导入的模块或表达式
 */
export interface ImportItem {
  /** 导入的表达式或标识符 */
  exp: string | ExpressionNode
  /** 模块路径 */
  path: string
}

/**
 * 转换上下文接口
 * 包含转换过程中所需的所有配置、状态和辅助方法
 * 继承自TransformOptions(移除了CompilerCompatOptions的部分)和CompilerCompatOptions
 */
export interface TransformContext
  extends Required<Omit<TransformOptions, keyof CompilerCompatOptions>>,
    CompilerCompatOptions {
  /** 组件自身名称，如果是单文件组件则为null */
  selfName: string | null
  /** 模板的根节点 */
  root: RootNode
  /** 辅助函数映射表，记录已使用的辅助函数及其引用计数 */
  helpers: Map<symbol, number>
  /** 组件集合，存储模板中使用的所有组件名称 */
  components: Set<string>
  /** 指令集合，存储模板中使用的所有指令名称 */
  directives: Set<string>
  /** 提升的节点数组，存储需要提升到渲染函数外部的节点 */
  hoists: (JSChildNode | null)[]
  /** 导入项数组，存储需要导入的模块或表达式 */
  imports: ImportItem[]
  /** 临时变量计数器，用于生成唯一的临时变量名 */
  temps: number
  /** 缓存表达式数组，存储已缓存的表达式 */
  cached: (CacheExpression | null)[]
  /** 标识符映射，记录作用域内的标识符及其引用计数 */
  identifiers: { [name: string]: number | undefined }
  /** 作用域计数器对象 */
  scopes: {
    /** v-for指令的嵌套层级计数 */
    vFor: number
    /** v-slot指令的嵌套层级计数 */
    vSlot: number
    /** v-pre指令的嵌套层级计数 */
    vPre: number
    /** v-once指令的嵌套层级计数 */
    vOnce: number
  }
  /** 当前节点的父节点 */
  parent: ParentNode | null
  // 我们可以使用栈，但实际上我们只需要向上两层
  // 所以这更高效
  /** 当前节点的祖父节点 */
  grandParent: ParentNode | null
  /** 当前节点在父节点子数组中的索引 */
  childIndex: number
  /** 当前正在处理的节点 */
  currentNode: RootNode | TemplateChildNode | null
  /** 是否在v-once指令作用域内 */
  inVOnce: boolean
  /**
   * 获取辅助函数
   * @param name 辅助函数名称
   * @returns 辅助函数符号
   */
  helper<T extends symbol>(name: T): T
  /**
   * 移除辅助函数
   * @param name 辅助函数名称
   */
  removeHelper<T extends symbol>(name: T): void
  /**
   * 获取辅助函数的字符串形式
   * @param name 辅助函数名称
   * @returns 辅助函数的字符串表示
   */
  helperString(name: symbol): string
  /**
   * 替换节点
   * @param node 新节点
   */
  replaceNode(node: TemplateChildNode): void
  /**
   * 移除节点
   * @param node 要移除的节点（可选，默认为当前节点）
   */
  removeNode(node?: TemplateChildNode): void
  /**
   * 节点被移除时的回调
   */
  onNodeRemoved(): void
  /**
   * 添加标识符到当前作用域
   * @param exp 表达式或字符串
   */
  addIdentifiers(exp: ExpressionNode | string): void
  /**
   * 从当前作用域移除标识符
   * @param exp 表达式或字符串
   */
  removeIdentifiers(exp: ExpressionNode | string): void
  /**
   * 提升表达式到渲染函数外部
   * @param exp 要提升的表达式
   * @returns 提升后的简单表达式节点
   */
  hoist(exp: string | JSChildNode | ArrayExpression): SimpleExpressionNode
  /**
   * 缓存表达式
   * @param exp 要缓存的表达式
   * @param isVNode 是否为VNode
   * @param inVOnce 是否在v-once作用域内
   * @returns 缓存表达式
   */
  cache(exp: JSChildNode, isVNode?: boolean, inVOnce?: boolean): CacheExpression
  /**
   * 常量缓存映射表
   * 存储模板子节点到常量类型的映射
   */
  constantCache: WeakMap<TemplateChildNode, ConstantTypes>

  /**
   * 过滤器集合
   * 存储模板中使用的所有过滤器名称
   * 仅用于2.x兼容性
   */
  // 2.x Compat only
  filters?: Set<string>
}

/**
 * 创建转换上下文
 * 初始化转换过程中所需的所有配置、状态和辅助方法
 * @param root 模板的根节点
 * @param options 转换选项
 * @returns 转换上下文对象
 */
export function createTransformContext(
  root: RootNode,
  {
    filename = '',
    prefixIdentifiers = false,
    hoistStatic = false,
    hmr = false,
    cacheHandlers = false,
    nodeTransforms = [],
    directiveTransforms = {},
    transformHoist = null,
    isBuiltInComponent = NOOP,
    isCustomElement = NOOP,
    expressionPlugins = [],
    scopeId = null,
    slotted = true,
    ssr = false,
    inSSR = false,
    ssrCssVars = ``,
    bindingMetadata = EMPTY_OBJ,
    inline = false,
    isTS = false,
    onError = defaultOnError,
    onWarn = defaultOnWarn,
    compatConfig,
  }: TransformOptions,
): TransformContext {
  const nameMatch = filename.replace(/\?.*$/, '').match(/([^/\\]+)\.\w+$/)
  const context: TransformContext = {
    // options
    filename,
    selfName: nameMatch && capitalize(camelize(nameMatch[1])),
    prefixIdentifiers,
    hoistStatic,
    hmr,
    cacheHandlers,
    nodeTransforms,
    directiveTransforms,
    transformHoist,
    isBuiltInComponent,
    isCustomElement,
    expressionPlugins,
    scopeId,
    slotted,
    ssr,
    inSSR,
    ssrCssVars,
    bindingMetadata,
    inline,
    isTS,
    onError,
    onWarn,
    compatConfig,

    // state
    root,
    helpers: new Map(),
    components: new Set(),
    directives: new Set(),
    hoists: [],
    imports: [],
    cached: [],
    constantCache: new WeakMap(),
    temps: 0,
    identifiers: Object.create(null),
    scopes: {
      vFor: 0,
      vSlot: 0,
      vPre: 0,
      vOnce: 0,
    },
    parent: null,
    grandParent: null,
    currentNode: root,
    childIndex: 0,
    inVOnce: false,

    // methods
    helper(name) {
      const count = context.helpers.get(name) || 0
      context.helpers.set(name, count + 1)
      return name
    },
    removeHelper(name) {
      const count = context.helpers.get(name)
      if (count) {
        const currentCount = count - 1
        if (!currentCount) {
          context.helpers.delete(name)
        } else {
          context.helpers.set(name, currentCount)
        }
      }
    },
    helperString(name) {
      return `_${helperNameMap[context.helper(name)]}`
    },
    replaceNode(node) {
      /* v8 ignore start */
      if (__DEV__) {
        if (!context.currentNode) {
          throw new Error(`Node being replaced is already removed.`)
        }
        if (!context.parent) {
          throw new Error(`Cannot replace root node.`)
        }
      }
      /* v8 ignore stop */
      context.parent!.children[context.childIndex] = context.currentNode = node
    },
    removeNode(node) {
      /* v8 ignore next 3 */
      if (__DEV__ && !context.parent) {
        throw new Error(`Cannot remove root node.`)
      }
      const list = context.parent!.children
      const removalIndex = node
        ? list.indexOf(node)
        : context.currentNode
          ? context.childIndex
          : -1
      /* v8 ignore next 3 */
      if (__DEV__ && removalIndex < 0) {
        throw new Error(`node being removed is not a child of current parent`)
      }
      if (!node || node === context.currentNode) {
        // current node removed
        context.currentNode = null
        context.onNodeRemoved()
      } else {
        // sibling node removed
        if (context.childIndex > removalIndex) {
          context.childIndex--
          context.onNodeRemoved()
        }
      }
      context.parent!.children.splice(removalIndex, 1)
    },
    onNodeRemoved: NOOP,
    addIdentifiers(exp) {
      // identifier tracking only happens in non-browser builds.
      if (!__BROWSER__) {
        if (isString(exp)) {
          addId(exp)
        } else if (exp.identifiers) {
          exp.identifiers.forEach(addId)
        } else if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
          addId(exp.content)
        }
      }
    },
    removeIdentifiers(exp) {
      if (!__BROWSER__) {
        if (isString(exp)) {
          removeId(exp)
        } else if (exp.identifiers) {
          exp.identifiers.forEach(removeId)
        } else if (exp.type === NodeTypes.SIMPLE_EXPRESSION) {
          removeId(exp.content)
        }
      }
    },
    hoist(exp) {
      if (isString(exp)) exp = createSimpleExpression(exp)
      context.hoists.push(exp)
      const identifier = createSimpleExpression(
        `_hoisted_${context.hoists.length}`,
        false,
        exp.loc,
        ConstantTypes.CAN_CACHE,
      )
      identifier.hoisted = exp
      return identifier
    },
    cache(exp, isVNode = false, inVOnce = false) {
      const cacheExp = createCacheExpression(
        context.cached.length,
        exp,
        isVNode,
        inVOnce,
      )
      context.cached.push(cacheExp)
      return cacheExp
    },
  }

  if (__COMPAT__) {
    context.filters = new Set()
  }

  function addId(id: string) {
    const { identifiers } = context
    if (identifiers[id] === undefined) {
      identifiers[id] = 0
    }
    identifiers[id]!++
  }

  function removeId(id: string) {
    context.identifiers[id]!--
  }

  return context
}

/**
 * 转换模板AST
 * 对模板根节点执行转换操作，包括节点转换、静态提升、代码生成等
 * @param root 模板的根节点
 * @param options 转换选项
 */
export function transform(root: RootNode, options: TransformOptions): void {
  const context = createTransformContext(root, options)
  traverseNode(root, context)
  if (options.hoistStatic) {
    cacheStatic(root, context)
  }
  if (!options.ssr) {
    createRootCodegen(root, context)
  }
  // finalize meta information
  root.helpers = new Set([...context.helpers.keys()])
  root.components = [...context.components]
  root.directives = [...context.directives]
  root.imports = context.imports
  root.hoists = context.hoists
  root.temps = context.temps
  root.cached = context.cached
  root.transformed = true

  if (__COMPAT__) {
    root.filters = [...context.filters!]
  }
}

/**
 * 创建根节点的代码生成节点
 * 处理根节点的代码生成逻辑，特别是对于单元素根节点的优化
 * @param root 模板的根节点
 * @param context 转换上下文
 */
function createRootCodegen(root: RootNode, context: TransformContext) {
  const { helper } = context
  const { children } = root
  if (children.length === 1) {
    const singleElementRootChild = getSingleElementRoot(root)
    // if the single child is an element, turn it into a block.
    if (singleElementRootChild && singleElementRootChild.codegenNode) {
      // single element root is never hoisted so codegenNode will never be
      // SimpleExpressionNode
      const codegenNode = singleElementRootChild.codegenNode
      if (codegenNode.type === NodeTypes.VNODE_CALL) {
        convertToBlock(codegenNode, context)
      }
      root.codegenNode = codegenNode
    } else {
      // - single <slot/>, IfNode, ForNode: already blocks.
      // - single text node: always patched.
      // root codegen falls through via genNode()
      root.codegenNode = children[0]
    }
  } else if (children.length > 1) {
    // root has multiple nodes - return a fragment block.
    let patchFlag = PatchFlags.STABLE_FRAGMENT
    // check if the fragment actually contains a single valid child with
    // the rest being comments
    if (
      __DEV__ &&
      children.filter(c => c.type !== NodeTypes.COMMENT).length === 1
    ) {
      patchFlag |= PatchFlags.DEV_ROOT_FRAGMENT
    }
    root.codegenNode = createVNodeCall(
      context,
      helper(FRAGMENT),
      undefined,
      root.children,
      patchFlag,
      undefined,
      undefined,
      true,
      undefined,
      false /* isComponent */,
    )
  } else {
    // no children = noop. codegen will return null.
  }
}

/**
 * 遍历父节点的子节点
 * 递归遍历并处理父节点的所有子节点
 * @param parent 父节点
 * @param context 转换上下文
 */
export function traverseChildren(
  parent: ParentNode,
  context: TransformContext,
): void {
  let i = 0
  const nodeRemoved = () => {
    i--
  }
  for (; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (isString(child)) continue
    context.grandParent = context.parent
    context.parent = parent
    context.childIndex = i
    context.onNodeRemoved = nodeRemoved
    traverseNode(child, context)
  }
}

/**
 * 遍历单个节点
 * 处理单个节点及其子节点，应用节点转换插件
 * @param node 要遍历的节点
 * @param context 转换上下文
 */
export function traverseNode(
  node: RootNode | TemplateChildNode,
  context: TransformContext,
): void {
  context.currentNode = node
  // apply transform plugins
  const { nodeTransforms } = context
  const exitFns = []
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }
    if (!context.currentNode) {
      // node was removed
      return
    } else {
      // node may have been replaced
      node = context.currentNode
    }
  }

  switch (node.type) {
    case NodeTypes.COMMENT:
      if (!context.ssr) {
        // inject import for the Comment symbol, which is needed for creating
        // comment nodes with `createVNode`
        context.helper(CREATE_COMMENT)
      }
      break
    case NodeTypes.INTERPOLATION:
      // no need to traverse, but we need to inject toString helper
      if (!context.ssr) {
        context.helper(TO_DISPLAY_STRING)
      }
      break

    // for container types, further traverse downwards
    case NodeTypes.IF:
      for (let i = 0; i < node.branches.length; i++) {
        traverseNode(node.branches[i], context)
      }
      break
    case NodeTypes.IF_BRANCH:
    case NodeTypes.FOR:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
  }

  // exit transforms
  context.currentNode = node
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

/**
 * 创建结构型指令转换函数
 * 用于创建处理特定结构型指令(如v-if, v-for)的转换函数
 * @param name 指令名称或匹配指令名称的正则表达式
 * @param fn 结构型指令转换函数
 * @returns 节点转换函数
 */
export function createStructuralDirectiveTransform(
  name: string | RegExp,
  fn: StructuralDirectiveTransform,
): NodeTransform {
  const matches = isString(name)
    ? (n: string) => n === name
    : (n: string) => name.test(n)

  return (node, context) => {
    if (node.type === NodeTypes.ELEMENT) {
      const { props } = node
      // structural directive transforms are not concerned with slots
      // as they are handled separately in vSlot.ts
      if (node.tagType === ElementTypes.TEMPLATE && props.some(isVSlot)) {
        return
      }
      const exitFns = []
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]
        if (prop.type === NodeTypes.DIRECTIVE && matches(prop.name)) {
          // structural directives are removed to avoid infinite recursion
          // also we remove them *before* applying so that it can further
          // traverse itself in case it moves the node around
          props.splice(i, 1)
          i--
          const onExit = fn(node, prop, context)
          if (onExit) exitFns.push(onExit)
        }
      }
      return exitFns
    }
  }
}
