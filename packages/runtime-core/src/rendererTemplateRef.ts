/**
 * Vue 3 核心模块 - 模板引用处理
 * 该模块负责处理模板中 ref 属性的绑定、更新和卸载逻辑
 */
import type { SuspenseBoundary } from './components/Suspense'
import type { VNode, VNodeNormalizedRef, VNodeNormalizedRefAtom } from './vnode'
import {
  EMPTY_OBJ,
  NO,
  ShapeFlags,
  hasOwn,
  isArray,
  isFunction,
  isString,
  remove,
} from '@vue/shared'
import { isAsyncWrapper } from './apiAsyncComponent'
import { warn } from './warning'
import { isRef, toRaw } from '@vue/reactivity'
import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import type { SchedulerJob } from './scheduler'
import { queuePostRenderEffect } from './renderer'
import { type ComponentOptions, getComponentPublicInstance } from './component'
import { knownTemplateRefs } from './helpers/useTemplateRef'

/**
 * 处理模板引用的核心函数
 * 负责设置、更新或卸载模板引用
 * @param rawRef 当前的引用对象
 * @param oldRawRef 旧的引用对象
 * @param parentSuspense 父级 Suspense 边界
 * @param vnode 当前虚拟节点
 * @param isUnmount 是否为卸载阶段
 */
export function setRef(
  rawRef: VNodeNormalizedRef,
  oldRawRef: VNodeNormalizedRef | null,
  parentSuspense: SuspenseBoundary | null,
  vnode: VNode,
  isUnmount = false,
): void {
  // 处理数组形式的引用
if (isArray(rawRef)) {
    rawRef.forEach((r, i) =>
      setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount,
      ),
    )
    return
  }

  // 处理异步组件的情况
if (isAsyncWrapper(vnode) && !isUnmount) {
    // #4999 if an async component already resolved and cached by KeepAlive,
    // we need to set the ref to inner component
    // 异步组件已经解析并被KeepAlive缓存的情况
// 需要将引用设置到内部组件
if (
      vnode.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE &&
      (vnode.type as ComponentOptions).__asyncResolved &&
      vnode.component!.subTree.component
    ) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component!.subTree)
    }

    // otherwise, nothing needs to be done because the template ref
    // is forwarded to inner component
    return
  }

  // 获取引用的值：组件实例或DOM元素
const refValue =
    vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT
      ? getComponentPublicInstance(vnode.component!)
      : vnode.el
  const value = isUnmount ? null : refValue

  // 解构引用所有者和引用对象
const { i: owner, r: ref } = rawRef
  // 开发环境下，检查引用所有者是否存在
if (__DEV__ && !owner) {
    warn(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. ` +
        `A vnode with ref must be created inside the render function.`,
    )
    return
  }
  const oldRef = oldRawRef && (oldRawRef as VNodeNormalizedRefAtom).r
  const refs = owner.refs === EMPTY_OBJ ? (owner.refs = {}) : owner.refs
  const setupState = owner.setupState
  const rawSetupState = toRaw(setupState)
  // 判断是否可以设置到setup状态中
const canSetSetupRef =
    setupState === EMPTY_OBJ
      ? NO
      : (key: string) => {
          if (__DEV__) {
            if (hasOwn(rawSetupState, key) && !isRef(rawSetupState[key])) {
              warn(
                `Template ref "${key}" used on a non-ref value. ` +
                  `It will not work in the production build.`,
              )
            }

            if (knownTemplateRefs.has(rawSetupState[key] as any)) {
              return false
            }
          }
          return hasOwn(rawSetupState, key)
        }

  // 动态引用已更改，清除旧引用
// dynamic ref changed. unset old ref
  // 如果旧引用存在且与新引用不同，则清除旧引用
if (oldRef != null && oldRef !== ref) {
    if (isString(oldRef)) {
      refs[oldRef] = null
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null
      }
    } else if (isRef(oldRef)) {
      oldRef.value = null
    }
  }

  // 处理函数形式的引用
if (isFunction(ref)) {
    callWithErrorHandling(ref, owner, ErrorCodes.FUNCTION_REF, [value, refs])
  } else {
    // 判断引用类型：字符串或Ref对象
const _isString = isString(ref)
    const _isRef = isRef(ref)

    if (_isString || _isRef) {
      // 定义设置引用值的函数
const doSet = () => {
        // 处理多个元素的引用（fragement）
if (rawRef.f) {
          const existing = _isString
            ? canSetSetupRef(ref)
              ? setupState[ref]
              : refs[ref]
            : ref.value
          // 卸载阶段：从数组中移除引用
if (isUnmount) {
            isArray(existing) && remove(existing, refValue)
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref] = [refValue]
                if (canSetSetupRef(ref)) {
                  setupState[ref] = refs[ref]
                }
              } else {
                ref.value = [refValue]
                if (rawRef.k) refs[rawRef.k] = ref.value
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue)
            }
          }
        } else if (_isString) {
          refs[ref] = value
          if (canSetSetupRef(ref)) {
            setupState[ref] = value
          }
        } else if (_isRef) {
          ref.value = value
          if (rawRef.k) refs[rawRef.k] = value
        } else if (__DEV__) {
          warn('Invalid template ref type:', ref, `(${typeof ref})`)
        }
      }
      // 对于非空值，在渲染后设置
if (value) {
        // #1789: for non-null values, set them after render
        // null values means this is unmount and it should not overwrite another
        // ref with the same key
        ;(doSet as SchedulerJob).id = -1
        queuePostRenderEffect(doSet, parentSuspense)
      } else {
        doSet()
      }
    } else if (__DEV__) {
      warn('Invalid template ref type:', ref, `(${typeof ref})`)
    }
  }
}
