/**
 * 补丁标志是由编译器生成的优化提示。
 * 当在差异比较(diff)过程中遇到带有dynamicChildren的块时，算法
 * 会进入"优化模式"。在这种模式下，我们知道虚拟DOM(vdom)是由
 * 编译器生成的渲染函数产生的，因此算法只需要处理
 * 由这些补丁标志明确标记的更新。
 *
 * 补丁标志可以使用 | 位运算符组合，并且可以使用 & 运算符检查，例如：
 *
 * ```js
 * const flag = TEXT | CLASS
 * if (flag & TEXT) { ... }
 * ```
 *
 * 查看 '../../runtime-core/src/renderer.ts' 中的 `patchElement` 函数，了解
 * 这些标志在差异比较过程中是如何被处理的。
 */
export enum PatchFlags {
  /**
   * 表示具有动态textContent的元素（子节点快速路径）
   */
  TEXT = 1,

  /**
   * 表示具有动态class绑定的元素
   */
  CLASS = 1 << 1,

  /**
   * 表示具有动态样式的元素
   * 编译器会将静态字符串样式预编译为静态对象
   * + 检测并提取内联静态对象
   * 例如：`style="color: red"` 和 `:style="{ color: 'red' }"` 都会被提取为：
   * ```js
   * const style = { color: 'red' }
   * render() { return e('div', { style }) }
   * ```
   */
  STYLE = 1 << 2,

  /**
   * 表示具有非class/style动态属性的元素
   * 也可以用于具有任何动态属性（包括class/style）的组件
   * 当存在此标志时，vnode还会有一个dynamicProps数组，包含可能变化的属性键
   * 以便运行时可以更快地比较它们（无需担心已删除的属性）
   */
  PROPS = 1 << 3,

  /**
   * 表示具有动态键的属性的元素
   * 当键更改时，始终需要完整的差异比较来删除旧键
   * 此标志与CLASS、STYLE和PROPS互斥
   */
  FULL_PROPS = 1 << 4,

  /**
   * 表示需要属性水合的元素
   * （但不一定需要补丁更新）
   * 例如：事件监听器和带有属性修饰符的v-bind
   */
  NEED_HYDRATION = 1 << 5,

  /**
   * 表示子节点顺序不变的片段
   */
  STABLE_FRAGMENT = 1 << 6,

  /**
   * 表示具有键控或部分键控子节点的片段
   */
  KEYED_FRAGMENT = 1 << 7,

  /**
   * 表示具有非键控子节点的片段
   */
  UNKEYED_FRAGMENT = 1 << 8,

  /**
   * 表示只需要非属性补丁的元素，例如ref或指令（onVnodeXXX钩子）
   * 由于每个被补丁的vnode都会检查ref和onVnodeXXX钩子
   * 此标志只是标记vnode，以便父块可以跟踪它
   */
  NEED_PATCH = 1 << 9,

  /**
   * 表示具有动态插槽的组件
   * （例如引用v-for迭代值的插槽，或动态插槽名称）
   * 带有此标志的组件始终会被强制更新
   */
  DYNAMIC_SLOTS = 1 << 10,

  /**
   * 表示仅因为用户在模板的根级别放置了注释而创建的片段
   * 这是一个仅开发环境的标志，因为注释在生产环境中会被删除
   */
  DEV_ROOT_FRAGMENT = 1 << 11,

  /**
   * 特殊标志 ----------------------------------------------------------------
   * 特殊标志是负整数
   * 它们从不使用位运算符进行匹配（位匹配只应在patchFlag > 0的分支中发生）
   * 并且是互斥的
   * 检查特殊标志时，只需检查patchFlag === FLAG
   */

  /**
   * 表示缓存的静态vnode
   * 这也是水合过程中跳过整个子树的提示，因为静态内容永远不需要更新
   */
  CACHED = -1,
  /**
   * 一个特殊标志，表示差异比较算法应退出优化模式
   * 例如，当renderSlot()创建的块片段遇到非编译器生成的插槽时
   * （即手动编写的渲染函数，这些应始终进行完整差异比较）
   * 或手动cloneVNodes时
   */
  BAIL = -2,
}

/**
 * 仅开发环境使用的标志到名称的映射
 * 用于在开发工具中显示更友好的标志名称
 */
export const PatchFlagNames: Record<PatchFlags, string> = {
  [PatchFlags.TEXT]: `TEXT`,
  [PatchFlags.CLASS]: `CLASS`,
  [PatchFlags.STYLE]: `STYLE`,
  [PatchFlags.PROPS]: `PROPS`,
  [PatchFlags.FULL_PROPS]: `FULL_PROPS`,
  [PatchFlags.NEED_HYDRATION]: `NEED_HYDRATION`,
  [PatchFlags.STABLE_FRAGMENT]: `STABLE_FRAGMENT`,
  [PatchFlags.KEYED_FRAGMENT]: `KEYED_FRAGMENT`,
  [PatchFlags.UNKEYED_FRAGMENT]: `UNKEYED_FRAGMENT`,
  [PatchFlags.NEED_PATCH]: `NEED_PATCH`,
  [PatchFlags.DYNAMIC_SLOTS]: `DYNAMIC_SLOTS`,
  [PatchFlags.DEV_ROOT_FRAGMENT]: `DEV_ROOT_FRAGMENT`,
  [PatchFlags.CACHED]: `CACHED`,
  [PatchFlags.BAIL]: `BAIL`,
}
