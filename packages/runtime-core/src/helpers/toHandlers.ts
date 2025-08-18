/**
 * 处理 v-on 指令对象的工具函数
 * 用于将 v-on="obj" 中的键名添加 "on" 前缀
 * 支持保留原始大小写（当 preserveCaseIfNecessary 为 true 且键名包含大写字母时）
 */
import { isObject, toHandlerKey } from '@vue/shared';
import { warn } from '../warning';

/**
 * 为 v-on="obj" 中的键名添加 "on" 前缀
 * @param obj - 包含事件处理函数的对象
 * @param preserveCaseIfNecessary - 是否在必要时保留原始大小写（主要用于非浏览器环境）
 * @returns 转换后的处理函数对象
 * @private
 */
export function toHandlers(
  obj: Record<string, any>,
  preserveCaseIfNecessary?: boolean
): Record<string, any> {
  const ret: Record<string, any> = {};

  // 开发环境下检查输入是否为对象
  if (__DEV__ && !isObject(obj)) {
    warn(`v-on 无参数时需要一个对象值。`);
    return ret;
  }

  // 遍历所有键并添加 "on" 前缀
  for (const key in obj) {
    // 根据条件决定是否保留原始大小写
    ret[
      preserveCaseIfNecessary && /[A-Z]/.test(key)
        ? `on:${key}` // 保留原始大小写，添加 on: 前缀
        : toHandlerKey(key) // 转换为标准的驼峰式处理函数名
    ] = obj[key];
  }

  return ret;
}
