/**
 * Vue 响应式系统常量定义
 * 包含跟踪操作类型、触发操作类型和响应式标志等枚举
 */
// 使用字符串字面量而不是数字，以便于检查
// 调试器事件相关常量

/**
 * 跟踪操作类型枚举
 * 用于依赖收集时标识操作类型
 */
export enum TrackOpTypes {
  /** 获取属性值操作 */
  GET = 'get',
  /** 检查属性是否存在操作 */
  HAS = 'has',
  /** 迭代操作（如遍历对象、数组） */
  ITERATE = 'iterate',
}


/**
 * 触发操作类型枚举
 * 用于触发依赖更新时标识操作类型
 */
export enum TriggerOpTypes {
  /** 设置属性值操作 */
  SET = 'set',
  /** 添加属性/元素操作 */
  ADD = 'add',
  /** 删除属性/元素操作 */
  DELETE = 'delete',
  /** 清空集合操作 */
  CLEAR = 'clear',
}


/**
 * 响应式标志枚举
 * 用于标识对象的响应式状态
 */
export enum ReactiveFlags {
  /** 跳过响应式处理的标志 */
  SKIP = '__v_skip',
  /** 是否为响应式对象的标志 */
  IS_REACTIVE = '__v_isReactive',
  /** 是否为只读对象的标志 */
  IS_READONLY = '__v_isReadonly',
  /** 是否为浅响应式对象的标志 */
  IS_SHALLOW = '__v_isShallow',
  /** 指向原始对象的引用标志 */
  RAW = '__v_raw',
  /** 是否为 Ref 对象的标志 */
  IS_REF = '__v_isRef',
}
