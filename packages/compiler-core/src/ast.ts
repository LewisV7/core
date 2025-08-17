/**
 * Vue 编译器核心中的抽象语法树(AST)定义
 * 该文件包含了模板编译过程中使用的各种节点类型、枚举和接口
 */
// 从 @vue/shared 导入补丁标志类型和字符串判断函数
import { type PatchFlags, isString } from '@vue/shared'
// 从 runtimeHelpers 导入运行时辅助函数类型
import {
  CREATE_BLOCK,         // 创建块节点的辅助函数
  CREATE_ELEMENT_BLOCK, // 创建元素块节点的辅助函数
  CREATE_ELEMENT_VNODE, // 创建元素虚拟节点的辅助函数
  type CREATE_SLOTS,    // 创建插槽的辅助函数类型
  CREATE_VNODE,         // 创建虚拟节点的辅助函数
  type FRAGMENT,        // 片段类型
  OPEN_BLOCK,           // 打开块的辅助函数
  type RENDER_LIST,     // 渲染列表的辅助函数类型
  type RENDER_SLOT,     // 渲染插槽的辅助函数类型
  WITH_DIRECTIVES,      // 处理指令的辅助函数
  type WITH_MEMO,       // 带记忆的辅助函数类型
} from './runtimeHelpers'
// 从 transformElement 导入属性表达式类型
import type { PropsExpression } from './transforms/transformElement'
// 从 transform 导入导入项和转换上下文类型
import type { ImportItem, TransformContext } from './transform'
// 从 @babel/types 导入 Babel 节点类型
import type { Node as BabelNode } from '@babel/types'

/**
 * Vue 模板是 HTML 的平台无关超集（仅语法）。
 * 更多命名空间可以由平台特定的编译器声明。
 */
// 命名空间类型
 export type Namespace = number

/**
 * 命名空间枚举
 * 用于区分不同类型的文档元素
 */
export enum Namespaces {
  HTML,      // HTML 命名空间
  SVG,       // SVG 命名空间
  MATH_ML,   // MathML 命名空间
}

/**
 * 节点类型枚举
 * 定义了模板编译过程中可能出现的各种节点类型
 */
export enum NodeTypes {
  ROOT,                     // 根节点
  ELEMENT,                  // 元素节点
  TEXT,                     // 文本节点
  COMMENT,                  // 注释节点
  SIMPLE_EXPRESSION,        // 简单表达式节点
  INTERPOLATION,            // 插值节点 {{ }}
  ATTRIBUTE,                // 属性节点
  DIRECTIVE,                // 指令节点
  // 容器节点
  COMPOUND_EXPRESSION,      // 复合表达式节点
  IF,                       // if 条件节点
  IF_BRANCH,                // if 分支节点
  FOR,                      // for 循环节点
  TEXT_CALL,                // 文本调用节点
  // 代码生成相关节点
  VNODE_CALL,               // 虚拟节点调用节点
  JS_CALL_EXPRESSION,       // JS 调用表达式节点
  JS_OBJECT_EXPRESSION,     // JS 对象表达式节点
  JS_PROPERTY,              // JS 属性节点
  JS_ARRAY_EXPRESSION,      // JS 数组表达式节点
  JS_FUNCTION_EXPRESSION,   // JS 函数表达式节点
  JS_CONDITIONAL_EXPRESSION, // JS 条件表达式节点
  JS_CACHE_EXPRESSION,      // JS 缓存表达式节点

  // SSR 代码生成相关节点
  JS_BLOCK_STATEMENT,       // JS 块语句节点
  JS_TEMPLATE_LITERAL,      // JS 模板字面量节点
  JS_IF_STATEMENT,          // JS if 语句节点
  JS_ASSIGNMENT_EXPRESSION, // JS 赋值表达式节点
  JS_SEQUENCE_EXPRESSION,   // JS 序列表达式节点
  JS_RETURN_STATEMENT,      // JS 返回语句节点
}

/**
 * 元素类型枚举
 * 用于区分不同类型的元素节点
 */
export enum ElementTypes {
  ELEMENT,   // 普通 HTML 元素
  COMPONENT, // 组件元素
  SLOT,      // 插槽元素
  TEMPLATE,  // 模板元素
}

/**
 * 节点接口
 * 所有 AST 节点的基础接口
 */
export interface Node {
  type: NodeTypes  // 节点类型
  loc: SourceLocation  // 节点在源代码中的位置信息
}

/**
 * 源代码位置接口
 * 表示节点在源代码中的范围
 * `start` 是包含的，`end` 是排除的，即 [start, end)
 */
export interface SourceLocation {
  start: Position  // 起始位置
  end: Position    // 结束位置
  source: string   // 源代码字符串
}

/**
 * 位置接口
 * 表示源代码中的一个具体位置
 */
export interface Position {
  offset: number  // 从文件开始的偏移量
  line: number    // 行号
  column: number  // 列号
}

/**
 * 父节点类型
 * 表示可以包含子节点的节点类型
 */
export type ParentNode = RootNode | ElementNode | IfBranchNode | ForNode

/**
 * 表达式节点类型
 * 表示各种表达式节点的联合类型
 */
export type ExpressionNode = SimpleExpressionNode | CompoundExpressionNode

/**
 * 模板子节点类型
 * 表示模板中可以出现的子节点类型
 */
export type TemplateChildNode =
  | ElementNode
  | InterpolationNode
  | CompoundExpressionNode
  | TextNode
  | CommentNode
  | IfNode
  | IfBranchNode
  | ForNode
  | TextCallNode

/**
 * 根节点接口
 * 表示模板的根节点
 */
export interface RootNode extends Node {
  type: NodeTypes.ROOT
  source: string               // 模板源代码
  children: TemplateChildNode[] // 子节点数组
  helpers: Set<symbol>         // 使用的辅助函数集合
  components: string[]         // 使用的组件名称数组
  directives: string[]         // 使用的指令名称数组
  hoists: (JSChildNode | null)[] // 提升的JS节点数组
  imports: ImportItem[]        // 导入项数组
  cached: (CacheExpression | null)[] // 缓存表达式数组
  temps: number                // 临时变量计数
  ssrHelpers?: symbol[]        // SSR 辅助函数数组（可选）
  codegenNode?: TemplateChildNode | JSChildNode | BlockStatement // 代码生成节点（可选）
  transformed?: boolean        // 是否已转换（可选）

  // 仅用于 v2 兼容性
  filters?: string[]           // 过滤器数组（可选）
}

/**
 * 元素节点类型
 * 表示各种元素节点的联合类型
 */
export type ElementNode =
  | PlainElementNode    // 普通元素节点
  | ComponentNode       // 组件节点
  | SlotOutletNode      // 插槽出口节点
  | TemplateNode        // 模板节点

/**
 * 基础元素节点接口
 * 所有元素节点的基类
 */
export interface BaseElementNode extends Node {
  type: NodeTypes.ELEMENT
  ns: Namespace                     // 命名空间
  tag: string                       // 标签名称
  tagType: ElementTypes             // 元素类型
  props: Array<AttributeNode | DirectiveNode> // 属性和指令数组
  children: TemplateChildNode[]     // 子节点数组
  isSelfClosing?: boolean           // 是否为自闭合标签（可选）
  innerLoc?: SourceLocation         // 内部位置信息（仅用于 SFC 根级元素）
}

/**
 * 普通元素节点接口
 * 表示普通 HTML 元素节点
 */
export interface PlainElementNode extends BaseElementNode {
  tagType: ElementTypes.ELEMENT
  codegenNode:
    | VNodeCall
    | SimpleExpressionNode // 当被提升时
    | CacheExpression // 当被 v-once 缓存时
    | MemoExpression // 当被 v-memo 缓存时
    | undefined
  ssrCodegenNode?: TemplateLiteral  // SSR 代码生成节点（可选）
}

/**
 * 组件节点接口
 * 表示组件元素节点
 */
export interface ComponentNode extends BaseElementNode {
  tagType: ElementTypes.COMPONENT
  codegenNode:
    | VNodeCall
    | CacheExpression // 当被 v-once 缓存时
    | MemoExpression // 当被 v-memo 缓存时
    | undefined
  ssrCodegenNode?: CallExpression  // SSR 代码生成节点（可选）
}

/**
 * 插槽出口节点接口
 * 表示 <slot> 元素节点
 */
export interface SlotOutletNode extends BaseElementNode {
  tagType: ElementTypes.SLOT
  codegenNode:
    | RenderSlotCall
    | CacheExpression // 当被 v-once 缓存时
    | undefined
  ssrCodegenNode?: CallExpression  // SSR 代码生成节点（可选）
}

/**
 * 模板节点接口
 * 表示 <template> 元素节点
 */
export interface TemplateNode extends BaseElementNode {
  tagType: ElementTypes.TEMPLATE
  // TemplateNode 是一个容器类型，在编译过程中会被移除
  codegenNode: undefined
}

/**
 * 文本节点接口
 * 表示文本内容节点
 */
export interface TextNode extends Node {
  type: NodeTypes.TEXT
  content: string  // 文本内容
}

/**
 * 注释节点接口
 * 表示注释内容节点
 */
export interface CommentNode extends Node {
  type: NodeTypes.COMMENT
  content: string  // 注释内容
}

/**
 * 属性节点接口
 * 表示元素的属性节点
 */
export interface AttributeNode extends Node {
  type: NodeTypes.ATTRIBUTE
  name: string         // 属性名称
  nameLoc: SourceLocation // 属性名称在源代码中的位置
  value: TextNode | undefined // 属性值，可能为 undefined
}

/**
 * 指令节点接口
 * 表示元素的指令节点
 */
export interface DirectiveNode extends Node {
  type: NodeTypes.DIRECTIVE
  /**
   * 标准化的名称，不带前缀或简写，例如 "bind"、"on"
   */
  name: string
  /**
   * 原始属性名称，保留简写，并包含参数和修饰符
   * 仅在解析过程中使用
   */
  rawName?: string
  exp: ExpressionNode | undefined  // 指令表达式
  arg: ExpressionNode | undefined  // 指令参数
  modifiers: SimpleExpressionNode[] // 指令修饰符数组
  /**
   * 可选属性，用于缓存 v-for 的表达式解析结果
   */
  forParseResult?: ForParseResult
}

/**
 * 常量类型枚举
 * 静态类型有多个级别。
 * 高级别包含低级别。例如，可以字符串化的节点
 * 总是可以被提升并在补丁过程中跳过。
 */
export enum ConstantTypes {
  NOT_CONSTANT = 0,     // 不是常量
  CAN_SKIP_PATCH,       // 可以跳过补丁
  CAN_CACHE,            // 可以缓存
  CAN_STRINGIFY,        // 可以字符串化
}

/**
 * 简单表达式节点接口
 * 表示简单表达式节点
 */
export interface SimpleExpressionNode extends Node {
  type: NodeTypes.SIMPLE_EXPRESSION
  content: string         // 表达式内容
  isStatic: boolean       // 是否为静态表达式
  constType: ConstantTypes // 常量类型
  /**
   * - `null` 表示表达式是不需要解析的简单标识符
   * - `false` 表示解析出错
   */
  ast?: BabelNode | null | false
  /**
   * 表示这是一个提升的虚拟节点调用的标识符，并指向提升的节点
   */
  hoisted?: JSChildNode
  /**
   * 解析为函数参数的表达式将跟踪函数体内声明的标识符
   */
  identifiers?: string[]
  isHandlerKey?: boolean  // 是否为处理器键
}

/**
 * 插值节点接口
 * 表示模板中的插值表达式节点 {{ }}
 */
export interface InterpolationNode extends Node {
  type: NodeTypes.INTERPOLATION
  content: ExpressionNode  // 插值内容表达式
}

/**
 * 复合表达式节点接口
 * 表示包含多个子表达式的复合表达式节点
 */
export interface CompoundExpressionNode extends Node {
  type: NodeTypes.COMPOUND_EXPRESSION
  /**
   * - `null` 表示表达式是不需要解析的简单标识符
   * - `false` 表示解析出错
   */
  ast?: BabelNode | null | false
  children: (
    | SimpleExpressionNode
    | CompoundExpressionNode
    | InterpolationNode
    | TextNode
    | string
    | symbol
  )[] // 子节点数组

  /**
   * 解析为函数参数的表达式将跟踪函数体内声明的标识符
   */
  identifiers?: string[]
  isHandlerKey?: boolean  // 是否为处理器键
}

/**
 * If 节点接口
 * 表示条件渲染节点（v-if）
 */
export interface IfNode extends Node {
  type: NodeTypes.IF
  branches: IfBranchNode[]  // 条件分支数组
  codegenNode?: IfConditionalExpression | CacheExpression // 代码生成节点，例如 <div v-if v-once>
}

/**
 * If 分支节点接口
 * 表示条件渲染的一个分支（v-if, v-else-if, v-else）
 */
export interface IfBranchNode extends Node {
  type: NodeTypes.IF_BRANCH
  condition: ExpressionNode | undefined // 条件表达式，else 分支为 undefined
  children: TemplateChildNode[] // 分支子节点
  userKey?: AttributeNode | DirectiveNode // 用户指定的 key 属性
  isTemplateIf?: boolean // 是否是 <template> 标签上的 v-if
}

/**
 * For 节点接口
 * 表示循环渲染节点（v-for）
 */
export interface ForNode extends Node {
  type: NodeTypes.FOR
  source: ExpressionNode // 遍历的源表达式
  valueAlias: ExpressionNode | undefined // 值别名（item）
  keyAlias: ExpressionNode | undefined // 键别名（key）
  objectIndexAlias: ExpressionNode | undefined // 索引别名（index）
  parseResult: ForParseResult // 解析结果
  children: TemplateChildNode[] // 循环体子节点
  codegenNode?: ForCodegenNode // 代码生成节点
}

/**
 * For 解析结果接口
 * 表示 v-for 表达式的解析结果
 */
export interface ForParseResult {
  source: ExpressionNode // 遍历的源表达式
  value: ExpressionNode | undefined // 值变量
  key: ExpressionNode | undefined // 键变量
  index: ExpressionNode | undefined // 索引变量
  finalized: boolean // 是否已完成解析
}

/**
 * 文本调用节点接口
 * 表示文本内容的调用节点
 */
export interface TextCallNode extends Node {
  type: NodeTypes.TEXT_CALL
  content: TextNode | InterpolationNode | CompoundExpressionNode // 文本内容
  codegenNode: CallExpression | SimpleExpressionNode // 代码生成节点（当被提升时）
}

/**
 * 模板文本子节点类型
 * 表示模板中可以作为文本子节点的类型
 */
export type TemplateTextChildNode =
  | TextNode
  | InterpolationNode
  | CompoundExpressionNode

/**
 * VNode 调用接口
 * 表示创建 VNode 的调用节点
 */
export interface VNodeCall extends Node {
  type: NodeTypes.VNODE_CALL
  tag: string | symbol | CallExpression // 标签名
  props: PropsExpression | undefined // 属性表达式
  children:
    | TemplateChildNode[] // 多个子节点
    | TemplateTextChildNode // 单个文本子节点
    | SlotsExpression // 组件插槽
    | ForRenderListExpression // v-for 片段调用
    | SimpleExpressionNode // 提升的节点
    | CacheExpression // 缓存的节点
    | undefined // 无子节点
  patchFlag: PatchFlags | undefined // 补丁标志
  dynamicProps: string | SimpleExpressionNode | undefined // 动态属性
  directives: DirectiveArguments | undefined // 指令参数
  isBlock: boolean // 是否为块节点
  disableTracking: boolean // 是否禁用跟踪
  isComponent: boolean // 是否为组件
}

// JS 节点类型 -----------------------------------------------------------------

// 我们还包含了一些 JavaScript AST 节点用于代码生成。
// 这个 AST 是一个有意简化的子集，仅满足 Vue 渲染函数生成的确切需求。

/**
 * JS 子节点类型
 * 表示 JavaScript 节点的子节点类型
 */
export type JSChildNode =
  | VNodeCall
  | CallExpression
  | ObjectExpression
  | ArrayExpression
  | ExpressionNode
  | FunctionExpression
  | ConditionalExpression
  | CacheExpression
  | AssignmentExpression
  | SequenceExpression

/**
 * 调用表达式接口
 * 表示函数调用表达式节点
 */
export interface CallExpression extends Node {
  type: NodeTypes.JS_CALL_EXPRESSION
  callee: string | symbol // 调用目标
  arguments: (
    | string
    | symbol
    | JSChildNode
    | SSRCodegenNode
    | TemplateChildNode
    | TemplateChildNode[]
  )[] // 参数数组
}

/**
 * 对象表达式接口
 * 表示对象字面量表达式节点
 */
export interface ObjectExpression extends Node {
  type: NodeTypes.JS_OBJECT_EXPRESSION
  properties: Array<Property> // 属性数组
}

/**
 * 属性接口
 * 表示对象的属性节点
 */
export interface Property extends Node {
  type: NodeTypes.JS_PROPERTY
  key: ExpressionNode // 属性键
  value: JSChildNode // 属性值
}

/**
 * 数组表达式接口
 * 表示数组字面量表达式节点
 */
export interface ArrayExpression extends Node {
  type: NodeTypes.JS_ARRAY_EXPRESSION
  elements: Array<string | Node> // 元素数组
}

/**
 * 函数表达式接口
 * 表示函数表达式节点
 */
export interface FunctionExpression extends Node {
  type: NodeTypes.JS_FUNCTION_EXPRESSION
  params: ExpressionNode | string | (ExpressionNode | string)[] | undefined // 参数
  returns?: TemplateChildNode | TemplateChildNode[] | JSChildNode // 返回值
  body?: BlockStatement | IfStatement // 函数体
  newline: boolean // 是否需要换行
  /**
   * 此标志用于代码生成，以确定是否需要生成 withScopeId() 包装器
   */
  isSlot: boolean
  /**
   * 仅 __COMPAT__ 模式，指示应从遗留的 $scopedSlots 实例属性中排除的插槽函数。
   */
  isNonScopedSlot?: boolean
}

/**
 * 条件表达式接口
 * 表示条件表达式节点（三元表达式）
 */
export interface ConditionalExpression extends Node {
  type: NodeTypes.JS_CONDITIONAL_EXPRESSION
  test: JSChildNode // 测试条件
  consequent: JSChildNode // 条件为真时的结果
  alternate: JSChildNode // 条件为假时的结果
  newline: boolean // 是否需要换行
}

/**
 * 缓存表达式接口
 * 表示缓存表达式节点
 */
export interface CacheExpression extends Node {
  type: NodeTypes.JS_CACHE_EXPRESSION
  index: number // 缓存索引
  value: JSChildNode // 缓存值
  needPauseTracking: boolean // 是否需要暂停跟踪
  inVOnce: boolean // 是否在 v-once 中
  needArraySpread: boolean // 是否需要数组展开
}

/**
 * 记忆表达式接口
 * 表示带有记忆功能的表达式节点
 */
export interface MemoExpression extends CallExpression {
  callee: typeof WITH_MEMO // 调用目标
  arguments: [ExpressionNode, MemoFactory, string, string] // 参数数组
}

/**
 * 记忆工厂接口
 * 表示记忆表达式的工厂函数接口
 */
interface MemoFactory extends FunctionExpression {
  returns: BlockCodegenNode // 返回值
}

// SSR 特定节点类型 -----------------------------------------------------------

/**
 * SSR 代码生成节点类型
 * 表示服务端渲染中使用的代码生成节点类型
 */
export type SSRCodegenNode =
  | BlockStatement
  | TemplateLiteral
  | IfStatement
  | AssignmentExpression
  | ReturnStatement
  | SequenceExpression

/**
 * 块语句接口
 * 表示代码块语句节点
 */
export interface BlockStatement extends Node {
  type: NodeTypes.JS_BLOCK_STATEMENT
  body: (JSChildNode | IfStatement)[] // 语句体
}

/**
 * 模板字符串接口
 * 表示模板字符串表达式节点
 */
export interface TemplateLiteral extends Node {
  type: NodeTypes.JS_TEMPLATE_LITERAL
  elements: (string | JSChildNode)[] // 模板元素
}

/**
 * If 语句接口
 * 表示条件语句节点
 */
export interface IfStatement extends Node {
  type: NodeTypes.JS_IF_STATEMENT
  test: ExpressionNode // 测试条件
  consequent: BlockStatement // 条件为真时执行的代码块
  alternate: IfStatement | BlockStatement | ReturnStatement | undefined // 条件为假时执行的代码块
}

/**
 * 赋值表达式接口
 * 表示赋值表达式节点
 */
export interface AssignmentExpression extends Node {
  type: NodeTypes.JS_ASSIGNMENT_EXPRESSION
  left: SimpleExpressionNode // 左操作数
  right: JSChildNode // 右操作数
}

/**
 * 序列表达式接口
 * 表示序列表达式节点
 */
export interface SequenceExpression extends Node {
  type: NodeTypes.JS_SEQUENCE_EXPRESSION
  expressions: JSChildNode[] // 表达式序列
}

/**
 * 返回语句接口
 * 表示返回语句节点
 */
export interface ReturnStatement extends Node {
  type: NodeTypes.JS_RETURN_STATEMENT
  returns: TemplateChildNode | TemplateChildNode[] | JSChildNode // 返回值
}

// 代码生成节点类型 ----------------------------------------------------------

/**
 * 指令参数接口
 * 表示指令参数的数组表达式节点
 */
export interface DirectiveArguments extends ArrayExpression {
  elements: DirectiveArgumentNode[] // 指令参数节点数组
}

/**
 * 指令参数节点接口
 * 表示单个指令参数的数组表达式节点
 */
export interface DirectiveArgumentNode extends ArrayExpression {
  elements: // dir, exp, arg, modifiers
  | [string]
    | [string, ExpressionNode]
    | [string, ExpressionNode, ExpressionNode]
    | [string, ExpressionNode, ExpressionNode, ObjectExpression]
}

// renderSlot(...) 调用接口
/**
 * 渲染插槽调用接口
 * 表示渲染插槽的调用节点
 */
export interface RenderSlotCall extends CallExpression {
  callee: typeof RENDER_SLOT // 调用目标
  arguments: // $slots, name, props, fallback
  | [string, string | ExpressionNode]
    | [string, string | ExpressionNode, PropsExpression]
    | [
        string,
        string | ExpressionNode,
        PropsExpression | '{}',
        TemplateChildNode[],
      ]
}

/**
 * 插槽表达式类型
 * 表示插槽表达式的联合类型
 */
export type SlotsExpression = SlotsObjectExpression | DynamicSlotsExpression

// { foo: () => [...] }
/**
 * 插槽对象表达式接口
 * 表示插槽对象的表达式节点
 */
export interface SlotsObjectExpression extends ObjectExpression {
  properties: SlotsObjectProperty[] // 插槽属性数组
}

/**
 * 插槽对象属性接口
 * 表示插槽对象的属性节点
 */
export interface SlotsObjectProperty extends Property {
  value: SlotFunctionExpression // 插槽函数表达式
}

/**
 * 插槽函数表达式接口
 * 表示插槽函数的表达式节点
 */
export interface SlotFunctionExpression extends FunctionExpression {
  returns: TemplateChildNode[] | CacheExpression // 返回值
}

// createSlots({ ... }, [
//    foo ? () => [] : undefined,
//    renderList(list, i => () => [i])
// ])
/**
 * 动态插槽表达式接口
 * 表示动态插槽的调用节点
 */
export interface DynamicSlotsExpression extends CallExpression {
  callee: typeof CREATE_SLOTS // 调用目标
  arguments: [SlotsObjectExpression, DynamicSlotEntries] // 参数数组
}

/**
 * 动态插槽条目接口
 * 表示动态插槽条目的数组表达式节点
 */
export interface DynamicSlotEntries extends ArrayExpression {
  elements: (ConditionalDynamicSlotNode | ListDynamicSlotNode)[] // 动态插槽节点数组
}

/**
 * 条件动态插槽节点接口
 * 表示条件动态插槽节点
 */
export interface ConditionalDynamicSlotNode extends ConditionalExpression {
  consequent: DynamicSlotNode // 条件为真时的动态插槽节点
  alternate: DynamicSlotNode | SimpleExpressionNode // 条件为假时的动态插槽节点或简单表达式
}

/**
 * 列表动态插槽节点接口
 * 表示列表动态插槽节点
 */
export interface ListDynamicSlotNode extends CallExpression {
  callee: typeof RENDER_LIST // 调用目标
  arguments: [ExpressionNode, ListDynamicSlotIterator] // 参数数组
}

/**
 * 列表动态插槽迭代器接口
 * 表示列表动态插槽的迭代器函数节点
 */
export interface ListDynamicSlotIterator extends FunctionExpression {
  returns: DynamicSlotNode // 返回值
}

/**
 * 动态插槽节点接口
 * 表示动态插槽的对象表达式节点
 */
export interface DynamicSlotNode extends ObjectExpression {
  properties: [Property, DynamicSlotFnProperty] // 属性数组
}

/**
 * 动态插槽函数属性接口
 * 表示动态插槽的函数属性节点
 */
export interface DynamicSlotFnProperty extends Property {
  value: SlotFunctionExpression // 插槽函数表达式
}

/**
 * 块代码生成节点类型
 * 表示块代码生成节点的联合类型
 */
export type BlockCodegenNode = VNodeCall | RenderSlotCall

/**
 * If 条件表达式接口
 * 表示 If 条件表达式节点
 */
export interface IfConditionalExpression extends ConditionalExpression {
  consequent: BlockCodegenNode | MemoExpression // 条件为真时的结果
  alternate: BlockCodegenNode | IfConditionalExpression | MemoExpression // 条件为假时的结果
}

/**
 * For 代码生成节点接口
 * 表示 for 循环渲染的代码生成节点
 */
export interface ForCodegenNode extends VNodeCall {
  isBlock: true // 是否为块节点
  tag: typeof FRAGMENT // 标签名
  props: undefined // 属性
  children: ForRenderListExpression // 子节点
  patchFlag: PatchFlags // 补丁标志
  disableTracking: boolean // 是否禁用跟踪
}

/**
 * For 渲染列表表达式接口
 * 表示 for 循环渲染列表的表达式节点
 */
export interface ForRenderListExpression extends CallExpression {
  callee: typeof RENDER_LIST // 调用目标
  arguments: [ExpressionNode, ForIteratorExpression] // 参数数组
}

/**
 * For 迭代器表达式接口
 * 表示 for 循环的迭代器函数节点
 */
export interface ForIteratorExpression extends FunctionExpression {
  returns?: BlockCodegenNode // 返回值
}

// AST 工具函数 ---------------------------------------------------------------

// 某些表达式，如序列和条件表达式，从不与模板节点关联，所以它们的源代码位置只是一个占位符。
// 像 CompoundExpression 这样的容器类型也不需要真实的位置。
/**
 * 位置占位符
 * 用于不需要真实位置信息的节点
 */
export const locStub: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
  source: '',
}

/**
 * 创建根节点
 * @param children - 子节点数组
 * @param source - 源代码字符串
 * @returns 根节点
 */
export function createRoot(
  children: TemplateChildNode[],
  source = '',
): RootNode {
  return {
    type: NodeTypes.ROOT,
    source,
    children,
    helpers: new Set(),
    components: [],
    directives: [],
    hoists: [],
    imports: [],
    cached: [],
    temps: 0,
    codegenNode: undefined,
    loc: locStub,
  }
}

/**
 * 创建 VNode 调用节点
 * @param context - 转换上下文
 * @param tag - 标签名
 * @param props - 属性
 * @param children - 子节点
 * @param patchFlag - 补丁标志
 * @param dynamicProps - 动态属性
 * @param directives - 指令
 * @param isBlock - 是否为块节点
 * @param disableTracking - 是否禁用跟踪
 * @param isComponent - 是否为组件
 * @param loc - 源代码位置
 * @returns VNode 调用节点
 */
export function createVNodeCall(
  context: TransformContext | null,
  tag: VNodeCall['tag'],
  props?: VNodeCall['props'],
  children?: VNodeCall['children'],
  patchFlag?: VNodeCall['patchFlag'],
  dynamicProps?: VNodeCall['dynamicProps'],
  directives?: VNodeCall['directives'],
  isBlock: VNodeCall['isBlock'] = false,
  disableTracking: VNodeCall['disableTracking'] = false,
  isComponent: VNodeCall['isComponent'] = false,
  loc: SourceLocation = locStub,
): VNodeCall {
  if (context) {
    if (isBlock) {
      context.helper(OPEN_BLOCK)
      context.helper(getVNodeBlockHelper(context.inSSR, isComponent))
    } else {
      context.helper(getVNodeHelper(context.inSSR, isComponent))
    }
    if (directives) {
      context.helper(WITH_DIRECTIVES)
    }
  }

  return {
    type: NodeTypes.VNODE_CALL,
    tag,
    props,
    children,
    patchFlag,
    dynamicProps,
    directives,
    isBlock,
    disableTracking,
    isComponent,
    loc,
  }
}

/**
 * 创建数组表达式节点
 * @param elements - 元素数组
 * @param loc - 源代码位置
 * @returns 数组表达式节点
 */
export function createArrayExpression(
  elements: ArrayExpression['elements'],
  loc: SourceLocation = locStub,
): ArrayExpression {
  return {
    type: NodeTypes.JS_ARRAY_EXPRESSION,
    loc,
    elements,
  }
}

/**
 * 创建对象表达式节点
 * @param properties - 属性数组
 * @param loc - 源代码位置
 * @returns 对象表达式节点
 */
export function createObjectExpression(
  properties: ObjectExpression['properties'],
  loc: SourceLocation = locStub,
): ObjectExpression {
  return {
    type: NodeTypes.JS_OBJECT_EXPRESSION,
    loc,
    properties,
  }
}

/**
 * 创建对象属性节点
 * @param key - 属性键
 * @param value - 属性值
 * @returns 对象属性节点
 */
export function createObjectProperty(
  key: Property['key'] | string,
  value: Property['value'],
): Property {
  return {
    type: NodeTypes.JS_PROPERTY,
    loc: locStub,
    key: isString(key) ? createSimpleExpression(key, true) : key,
    value,
  }
}

/**
 * 创建简单表达式节点
 * @param content - 表达式内容
 * @param isStatic - 是否为静态
 * @param loc - 源代码位置
 * @param constType - 常量类型
 * @returns 简单表达式节点
 */
export function createSimpleExpression(
  content: SimpleExpressionNode['content'],
  isStatic: SimpleExpressionNode['isStatic'] = false,
  loc: SourceLocation = locStub,
  constType: ConstantTypes = ConstantTypes.NOT_CONSTANT,
): SimpleExpressionNode {
  return {
    type: NodeTypes.SIMPLE_EXPRESSION,
    loc,
    content,
    isStatic,
    constType: isStatic ? ConstantTypes.CAN_STRINGIFY : constType,
  }
}

/**
 * 创建插值节点
 * @param content - 插值内容
 * @param loc - 源代码位置
 * @returns 插值节点
 */
export function createInterpolation(
  content: InterpolationNode['content'] | string,
  loc: SourceLocation,
): InterpolationNode {
  return {
    type: NodeTypes.INTERPOLATION,
    loc,
    content: isString(content)
      ? createSimpleExpression(content, false, loc)
      : content,
  }
}

/**
 * 创建复合表达式节点
 * @param children - 子节点数组
 * @param loc - 源代码位置
 * @returns 复合表达式节点
 */
export function createCompoundExpression(
  children: CompoundExpressionNode['children'],
  loc: SourceLocation = locStub,
): CompoundExpressionNode {
  return {
    type: NodeTypes.COMPOUND_EXPRESSION,
    loc,
    children,
  }
}

type InferCodegenNodeType<T> = T extends typeof RENDER_SLOT
  ? RenderSlotCall
  : CallExpression

/**
 * 创建调用表达式节点
 * @param callee - 调用目标
 * @param args - 参数数组
 * @param loc - 源代码位置
 * @returns 调用表达式节点
 */
export function createCallExpression<T extends CallExpression['callee']>(
  callee: T,
  args: CallExpression['arguments'] = [],
  loc: SourceLocation = locStub,
): InferCodegenNodeType<T> {
  return {
    type: NodeTypes.JS_CALL_EXPRESSION,
    loc,
    callee,
    arguments: args,
  } as InferCodegenNodeType<T>
}

/**
 * 创建函数表达式节点
 * @param params - 参数
 * @param returns - 返回值
 * @param newline - 是否需要换行
 * @param isSlot - 是否为插槽函数
 * @param loc - 源代码位置
 * @returns 函数表达式节点
 */
export function createFunctionExpression(
  params: FunctionExpression['params'],
  returns: FunctionExpression['returns'] = undefined,
  newline: boolean = false,
  isSlot: boolean = false,
  loc: SourceLocation = locStub,
): FunctionExpression {
  return {
    type: NodeTypes.JS_FUNCTION_EXPRESSION,
    params,
    returns,
    newline,
    isSlot,
    loc,
  }
}

/**
 * 创建条件表达式节点
 * @param test - 测试条件
 * @param consequent - 条件为真时的结果
 * @param alternate - 条件为假时的结果
 * @param newline - 是否需要换行
 * @returns 条件表达式节点
 */
export function createConditionalExpression(
  test: ConditionalExpression['test'],
  consequent: ConditionalExpression['consequent'],
  alternate: ConditionalExpression['alternate'],
  newline = true,
): ConditionalExpression {
  return {
    type: NodeTypes.JS_CONDITIONAL_EXPRESSION,
    test,
    consequent,
    alternate,
    newline,
    loc: locStub,
  }
}

/**
 * 创建缓存表达式节点
 * @param index - 缓存索引
 * @param value - 缓存值
 * @param needPauseTracking - 是否需要暂停跟踪
 * @param inVOnce - 是否在 v-once 中
 * @returns 缓存表达式节点
 */
export function createCacheExpression(
  index: number,
  value: JSChildNode,
  needPauseTracking: boolean = false,
  inVOnce: boolean = false,
): CacheExpression {
  return {
    type: NodeTypes.JS_CACHE_EXPRESSION,
    index,
    value,
    needPauseTracking: needPauseTracking,
    inVOnce,
    needArraySpread: false,
    loc: locStub,
  }
}

export function createBlockStatement(
  body: BlockStatement['body'],
): BlockStatement {
  return {
    type: NodeTypes.JS_BLOCK_STATEMENT,
    body,
    loc: locStub,
  }
}

export function createTemplateLiteral(
  elements: TemplateLiteral['elements'],
): TemplateLiteral {
  return {
    type: NodeTypes.JS_TEMPLATE_LITERAL,
    elements,
    loc: locStub,
  }
}

export function createIfStatement(
  test: IfStatement['test'],
  consequent: IfStatement['consequent'],
  alternate?: IfStatement['alternate'],
): IfStatement {
  return {
    type: NodeTypes.JS_IF_STATEMENT,
    test,
    consequent,
    alternate,
    loc: locStub,
  }
}

export function createAssignmentExpression(
  left: AssignmentExpression['left'],
  right: AssignmentExpression['right'],
): AssignmentExpression {
  return {
    type: NodeTypes.JS_ASSIGNMENT_EXPRESSION,
    left,
    right,
    loc: locStub,
  }
}

/**
 * 创建序列表达式节点
 * @param expressions - 表达式数组
 * @param loc - 源代码位置
 * @returns 序列表达式节点
 */
export function createSequenceExpression(
  expressions: SequenceExpression['expressions'],
  loc: SourceLocation = locStub,
): SequenceExpression {
  return {
    type: NodeTypes.JS_SEQUENCE_EXPRESSION,
    expressions,
    loc,
  }
}

/**
 * 创建返回语句节点
 * @param returns - 返回值
 * @param loc - 源代码位置
 * @returns 返回语句节点
 */
export function createReturnStatement(
  returns: ReturnStatement['returns'],
  loc: SourceLocation = locStub,
): ReturnStatement {
  return {
    type: NodeTypes.JS_RETURN_STATEMENT,
    returns,
    loc,
  }
}

/**
 * 获取虚拟节点辅助函数
 * @param ssr - 是否为服务端渲染
 * @param isComponent - 是否为组件
 * @returns 虚拟节点创建函数
 */
export function getVNodeHelper(
  ssr: boolean,
  isComponent: boolean,
): typeof CREATE_VNODE | typeof CREATE_ELEMENT_VNODE {
  return ssr || isComponent ? CREATE_VNODE : CREATE_ELEMENT_VNODE
}

/**
 * 获取块节点辅助函数
 * @param ssr - 是否为服务端渲染
 * @param isComponent - 是否为组件
 * @returns 块节点创建函数
 */
export function getVNodeBlockHelper(
  ssr: boolean,
  isComponent: boolean,
): typeof CREATE_BLOCK | typeof CREATE_ELEMENT_BLOCK {
  return ssr || isComponent ? CREATE_BLOCK : CREATE_ELEMENT_BLOCK
}

/**
 * 转换为块节点
 * @param node - 虚拟节点调用
 * @param context - 转换上下文
 */
export function convertToBlock(
  node: VNodeCall,
  { helper, removeHelper, inSSR }: TransformContext,
): void {
  if (!node.isBlock) {
    node.isBlock = true
    removeHelper(getVNodeHelper(inSSR, node.isComponent))
    helper(OPEN_BLOCK)
    helper(getVNodeBlockHelper(inSSR, node.isComponent))
  }
}
