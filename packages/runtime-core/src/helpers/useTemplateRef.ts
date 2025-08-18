/**
 * 用于创建模板引用的工具函数
 * 提供对组件模板中DOM元素或组件实例的引用访问
 */
import { type ShallowRef, readonly, shallowRef } from '@vue/reactivity';
import { getCurrentInstance } from '../component';
import { warn } from '../warning';
import { EMPTY_OBJ } from '@vue/shared';

/**
 * 存储已知的模板引用的WeakSet集合
 * 用于在开发环境中跟踪和验证模板引用
 */
export const knownTemplateRefs: WeakSet<ShallowRef> = new WeakSet();

/**
 * 模板引用的类型定义
 * @typeparam T - 引用目标的类型，默认为unknown
 */
export type TemplateRef<T = unknown> = Readonly<ShallowRef<T | null>>;

/**
 * 创建一个模板引用
 * @param key - 引用的唯一标识符
 * @typeparam T - 引用目标的类型，默认为unknown
 * @typeparam Keys - 键的类型，默认为string
 * @returns 只读的浅层响应式引用
 * @example
 * ```ts
 * const inputRef = useTemplateRef<HTMLInputElement>('input')
 * // 在模板中: <input ref="input" />
 * ```
 */
export function useTemplateRef<T = unknown, Keys extends string = string>(
  key: Keys
): TemplateRef<T> {
  // 获取当前组件实例
  const i = getCurrentInstance();
  // 创建一个浅层响应式引用，初始值为null
  const r = shallowRef(null);

  if (i) {
    // 确保refs对象已初始化
    const refs = i.refs === EMPTY_OBJ ? (i.refs = {}) : i.refs;
    let desc: PropertyDescriptor | undefined;

    // 开发环境下检查引用是否已存在
    if (
      __DEV__ &&
      (desc = Object.getOwnPropertyDescriptor(refs, key)) &&
      !desc.configurable
    ) {
      warn(`useTemplateRef('${key}') 已经存在。`);
    } else {
      // 定义属性描述符，使引用可被模板访问
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: () => r.value,
        set: val => (r.value = val),
      });
    }
  } else if (__DEV__) {
    // 开发环境下警告：没有活动组件实例
    warn(
      `useTemplateRef() 在没有活动组件实例可关联时被调用。`,
    );
  }

  // 开发环境下返回只读引用，生产环境下返回普通引用
  const ret = __DEV__ ? readonly(r) : r;

  // 开发环境下将引用添加到已知集合中
  if (__DEV__) {
    knownTemplateRefs.add(ret);
  }

  return ret;
}
