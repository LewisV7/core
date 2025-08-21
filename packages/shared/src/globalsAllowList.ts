/**
 * 全局变量允许列表
 * 此文件定义了Vue模板中允许访问的全局变量列表及相关检查函数
 */
import { makeMap } from './makeMap'

/**
 * 允许的全局变量列表
 * 包含JavaScript中常用的全局对象和函数
 */
const GLOBALS_ALLOWED =
  'Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,' +
  'decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,' +
  'Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol'

/**
 * 检查一个键是否在允许的全局变量列表中
 * @param {string} key - 要检查的键
 * @returns {boolean} 是否在允许的全局变量列表中
 */
export const isGloballyAllowed: (key: string) => boolean =
  /*@__PURE__*/ makeMap(GLOBALS_ALLOWED)

/**
 * 已弃用的全局变量白名单检查函数
 * @deprecated 请使用`isGloballyAllowed`代替
 * @param {string} key - 要检查的键
 * @returns {boolean} 是否在允许的全局变量列表中
 */
export const isGloballyWhitelisted: (key: string) => boolean = isGloballyAllowed
