/**
 * Vue 2 兼容性模块 - 组件转换
 *
 * 此模块提供了将 Vue 2 风格组件转换为 Vue 3 兼容格式的功能。
 * 主要处理 Vue 2 构造函数组件、异步组件和函数式组件的转换。
 */
import { isFunction, isObject } from '@vue/shared'
import type { Component, ComponentInternalInstance } from '../component'
import {
  DeprecationTypes,
  checkCompatEnabled,
  softAssertCompatEnabled,
} from './compatConfig'
import { convertLegacyAsyncComponent } from './componentAsync'
import { convertLegacyFunctionalComponent } from './componentFunctional'

/**
 * 转换 Vue 2 风格组件为 Vue 3 兼容格式
 *
 * @param {any} comp - 要转换的 Vue 2 组件
 * @param {ComponentInternalInstance | null} instance - 组件内部实例（可选）
 * @returns {Component} - 转换后的 Vue 3 兼容组件
 */
export function convertLegacyComponent(
  comp: any,
  instance: ComponentInternalInstance | null,
): Component {
  // 内置组件无需转换，直接返回
  if (comp.__isBuiltIn) {
    return comp
  }

  // 处理 Vue 2 构造函数组件
  if (isFunction(comp) && comp.cid) {
    // #7766：处理从 SFC 编译的组件
    if (comp.render) {
      // 仅在从 SFC 编译时需要
      comp.options.render = comp.render
    }
    // 复制由 SFC 编译器设置的内部属性
    comp.options.__file = comp.__file
    comp.options.__hmrId = comp.__hmrId
    comp.options.__scopeId = comp.__scopeId
    comp = comp.options
  }

  // 处理 Vue 2 异步组件
  if (
    isFunction(comp) &&
    checkCompatEnabled(DeprecationTypes.COMPONENT_ASYNC, instance, comp)
  ) {
    // 禁用此兼容性后，普通函数仍然是有效用法，因此不使用 softAssert
    return convertLegacyAsyncComponent(comp)
  }

  // 处理 Vue 2 函数式组件
  if (
    isObject(comp) &&
    comp.functional &&
    softAssertCompatEnabled(
      DeprecationTypes.COMPONENT_FUNCTIONAL,
      instance,
      comp,
    )
  ) {
    return convertLegacyFunctionalComponent(comp)
  }

  // 无需转换的组件直接返回
  return comp
}
