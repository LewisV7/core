 /**
 * Vue运行时帮助函数符号定义
 * 此文件定义了编译器在生成代码时使用的各种运行时帮助函数的唯一标识符
 * 以及这些标识符到实际运行时函数名称的映射
 */

/**
 * 片段组件的唯一标识符
 */
export const FRAGMENT: unique symbol = Symbol(__DEV__ ? `Fragment` : ``)
/**
 *  teleport组件的唯一标识符
 */
export const TELEPORT: unique symbol = Symbol(__DEV__ ? `Teleport` : ``)
/**
 *  Suspense组件的唯一标识符
 */
export const SUSPENSE: unique symbol = Symbol(__DEV__ ? `Suspense` : ``)
/**
 *  KeepAlive组件的唯一标识符
 */
export const KEEP_ALIVE: unique symbol = Symbol(__DEV__ ? `KeepAlive` : ``)
/**
 *  基础过渡组件的唯一标识符
 */
export const BASE_TRANSITION: unique symbol = Symbol(
  __DEV__ ? `BaseTransition` : ``,
)
/**
 *  打开块的运行时函数标识符
 */
export const OPEN_BLOCK: unique symbol = Symbol(__DEV__ ? `openBlock` : ``)
/**
 *  创建块的运行时函数标识符
 */
export const CREATE_BLOCK: unique symbol = Symbol(__DEV__ ? `createBlock` : ``)
/**
 *  创建元素块的运行时函数标识符
 */
export const CREATE_ELEMENT_BLOCK: unique symbol = Symbol(
  __DEV__ ? `createElementBlock` : ``,
)
/**
 *  创建虚拟节点的运行时函数标识符
 */
export const CREATE_VNODE: unique symbol = Symbol(__DEV__ ? `createVNode` : ``)
/**
 *  创建元素虚拟节点的运行时函数标识符
 */
export const CREATE_ELEMENT_VNODE: unique symbol = Symbol(
  __DEV__ ? `createElementVNode` : ``,
)
/**
 *  创建注释虚拟节点的运行时函数标识符
 */
export const CREATE_COMMENT: unique symbol = Symbol(
  __DEV__ ? `createCommentVNode` : ``,
)
/**
 *  创建文本虚拟节点的运行时函数标识符
 */
export const CREATE_TEXT: unique symbol = Symbol(
  __DEV__ ? `createTextVNode` : ``,
)
/**
 *  创建静态虚拟节点的运行时函数标识符
 */
export const CREATE_STATIC: unique symbol = Symbol(
  __DEV__ ? `createStaticVNode` : ``,
)
/**
 *  解析组件的运行时函数标识符
 */
export const RESOLVE_COMPONENT: unique symbol = Symbol(
  __DEV__ ? `resolveComponent` : ``,
)
/**
 *  解析动态组件的运行时函数标识符
 */
export const RESOLVE_DYNAMIC_COMPONENT: unique symbol = Symbol(
  __DEV__ ? `resolveDynamicComponent` : ``,
)
/**
 *  解析指令的运行时函数标识符
 */
export const RESOLVE_DIRECTIVE: unique symbol = Symbol(
  __DEV__ ? `resolveDirective` : ``,
)
/**
 *  解析过滤器的运行时函数标识符
 */
export const RESOLVE_FILTER: unique symbol = Symbol(
  __DEV__ ? `resolveFilter` : ``,
)
/**
 *  应用指令的运行时函数标识符
 */
export const WITH_DIRECTIVES: unique symbol = Symbol(
  __DEV__ ? `withDirectives` : ``,
)
/**
 *  渲染列表的运行时函数标识符
 */
export const RENDER_LIST: unique symbol = Symbol(__DEV__ ? `renderList` : ``)
/**
 *  渲染插槽的运行时函数标识符
 */
export const RENDER_SLOT: unique symbol = Symbol(__DEV__ ? `renderSlot` : ``)
/**
 *  创建插槽的运行时函数标识符
 */
export const CREATE_SLOTS: unique symbol = Symbol(__DEV__ ? `createSlots` : ``)
/**
 *  将值转换为显示字符串的运行时函数标识符
 */
export const TO_DISPLAY_STRING: unique symbol = Symbol(
  __DEV__ ? `toDisplayString` : ``,
)
/**
 *  合并属性的运行时函数标识符
 */
export const MERGE_PROPS: unique symbol = Symbol(__DEV__ ? `mergeProps` : ``)
/**
 *  标准化类名的运行时函数标识符
 */
export const NORMALIZE_CLASS: unique symbol = Symbol(
  __DEV__ ? `normalizeClass` : ``,
)
/**
 *  标准化样式的运行时函数标识符
 */
export const NORMALIZE_STYLE: unique symbol = Symbol(
  __DEV__ ? `normalizeStyle` : ``,
)
/**
 *  标准化属性的运行时函数标识符
 */
export const NORMALIZE_PROPS: unique symbol = Symbol(
  __DEV__ ? `normalizeProps` : ``,
)
/**
 *  保护响应式属性的运行时函数标识符
 */
export const GUARD_REACTIVE_PROPS: unique symbol = Symbol(
  __DEV__ ? `guardReactiveProps` : ``,
)
/**
 *  转换为处理器的运行时函数标识符
 */
export const TO_HANDLERS: unique symbol = Symbol(__DEV__ ? `toHandlers` : ``)
/**
 *  转换为驼峰式命名的运行时函数标识符
 */
export const CAMELIZE: unique symbol = Symbol(__DEV__ ? `camelize` : ``)
/**
 *  首字母大写的运行时函数标识符
 */
export const CAPITALIZE: unique symbol = Symbol(__DEV__ ? `capitalize` : ``)
/**
 *  转换为处理器键名的运行时函数标识符
 */
export const TO_HANDLER_KEY: unique symbol = Symbol(
  __DEV__ ? `toHandlerKey` : ``,
)
/**
 *  设置块跟踪的运行时函数标识符
 */
export const SET_BLOCK_TRACKING: unique symbol = Symbol(
  __DEV__ ? `setBlockTracking` : ``,
)
/**
 *  推送作用域ID的运行时函数标识符
 * @deprecated 在3.5+版本中不再需要，因为我们不再提升元素节点
 * 但为了向后兼容而保留
 */
export const PUSH_SCOPE_ID: unique symbol = Symbol(__DEV__ ? `pushScopeId` : ``)
/**
 *  弹出作用域ID的运行时函数标识符
 * @deprecated 为了向后兼容而保留
 */
export const POP_SCOPE_ID: unique symbol = Symbol(__DEV__ ? `popScopeId` : ``)
/**
 *  带有上下文的运行时函数标识符
 */
export const WITH_CTX: unique symbol = Symbol(__DEV__ ? `withCtx` : ``)
/**
 *  解引用的运行时函数标识符
 */
export const UNREF: unique symbol = Symbol(__DEV__ ? `unref` : ``)
/**
 *  检查是否为引用的运行时函数标识符
 */
export const IS_REF: unique symbol = Symbol(__DEV__ ? `isRef` : ``)
/**
 *  带有记忆的运行时函数标识符
 */
export const WITH_MEMO: unique symbol = Symbol(__DEV__ ? `withMemo` : ``)
/**
 *  检查记忆是否相同的运行时函数标识符
 */
export const IS_MEMO_SAME: unique symbol = Symbol(__DEV__ ? `isMemoSame` : ``)

/**
 * 运行时帮助函数名称映射
 * 将帮助函数符号映射到对应的运行时函数名称字符串
 * 这些名称用于在生成的代码中从'vue'导入相应的帮助函数
 * 确保这些函数在运行时正确导出！
 */
export const helperNameMap: Record<symbol, string> = {
  [FRAGMENT]: `Fragment`,
  [TELEPORT]: `Teleport`,
  [SUSPENSE]: `Suspense`,
  [KEEP_ALIVE]: `KeepAlive`,
  [BASE_TRANSITION]: `BaseTransition`,
  [OPEN_BLOCK]: `openBlock`,
  [CREATE_BLOCK]: `createBlock`,
  [CREATE_ELEMENT_BLOCK]: `createElementBlock`,
  [CREATE_VNODE]: `createVNode`,
  [CREATE_ELEMENT_VNODE]: `createElementVNode`,
  [CREATE_COMMENT]: `createCommentVNode`,
  [CREATE_TEXT]: `createTextVNode`,
  [CREATE_STATIC]: `createStaticVNode`,
  [RESOLVE_COMPONENT]: `resolveComponent`,
  [RESOLVE_DYNAMIC_COMPONENT]: `resolveDynamicComponent`,
  [RESOLVE_DIRECTIVE]: `resolveDirective`,
  [RESOLVE_FILTER]: `resolveFilter`,
  [WITH_DIRECTIVES]: `withDirectives`,
  [RENDER_LIST]: `renderList`,
  [RENDER_SLOT]: `renderSlot`,
  [CREATE_SLOTS]: `createSlots`,
  [TO_DISPLAY_STRING]: `toDisplayString`,
  [MERGE_PROPS]: `mergeProps`,
  [NORMALIZE_CLASS]: `normalizeClass`,
  [NORMALIZE_STYLE]: `normalizeStyle`,
  [NORMALIZE_PROPS]: `normalizeProps`,
  [GUARD_REACTIVE_PROPS]: `guardReactiveProps`,
  [TO_HANDLERS]: `toHandlers`,
  [CAMELIZE]: `camelize`,
  [CAPITALIZE]: `capitalize`,
  [TO_HANDLER_KEY]: `toHandlerKey`,
  [SET_BLOCK_TRACKING]: `setBlockTracking`,
  [PUSH_SCOPE_ID]: `pushScopeId`,
  [POP_SCOPE_ID]: `popScopeId`,
  [WITH_CTX]: `withCtx`,
  [UNREF]: `unref`,
  [IS_REF]: `isRef`,
  [WITH_MEMO]: `withMemo`,
  [IS_MEMO_SAME]: `isMemoSame`,
}

/**
 * 注册运行时帮助函数
 * @param helpers 包含帮助函数符号和对应名称的对象
 * 此函数用于将自定义运行时帮助函数注册到帮助函数名称映射中
 */
export function registerRuntimeHelpers(helpers: Record<symbol, string>): void {
  Object.getOwnPropertySymbols(helpers).forEach(s => {
    helperNameMap[s] = helpers[s]
  })
}
