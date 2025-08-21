/*
 * Vue 运行时 DOM 模块
 * 提供与浏览器 DOM 交互相关的核心功能，包括创建应用实例、渲染虚拟 DOM、
 * 处理 DOM 元素更新以及服务端渲染的水合功能等。
 */
import {
  type App,
  type CreateAppFunction,
  type DefineComponent,
  DeprecationTypes,
  type Directive,
  type ElementNamespace,
  type HydrationRenderer,
  type Renderer,
  type RootHydrateFunction,
  type RootRenderFunction,
  compatUtils,
  createHydrationRenderer,
  createRenderer,
  isRuntimeOnly,
  warn,
} from '@vue/runtime-core'
import { nodeOps } from './nodeOps'
import { patchProp } from './patchProp'
// Importing from the compiler, will be tree-shaken in prod
import {
  NOOP,
  extend,
  isFunction,
  isHTMLTag,
  isMathMLTag,
  isSVGTag,
  isString,
} from '@vue/shared'
import type { TransitionProps } from './components/Transition'
import type { TransitionGroupProps } from './components/TransitionGroup'
import type { vShow } from './directives/vShow'
import type { VOnDirective } from './directives/vOn'
import type { VModelDirective } from './directives/vModel'

/**
 * 为避免直接依赖 DOM 类型而提供的存根实现
 *
 * 要启用正确的类型检查，请在 tsconfig.json 中将 "dom" 添加到 "lib" 配置中。
 */
type DomStub = {}
type DomType<T> = typeof globalThis extends { window: unknown } ? T : DomStub

declare module '@vue/reactivity' {
  export interface RefUnwrapBailTypes {
    runtimeDOMBailTypes: DomType<Node | Window>
  }
}

declare module '@vue/runtime-core' {
  interface GlobalComponents {
    Transition: DefineComponent<TransitionProps>
    TransitionGroup: DefineComponent<TransitionGroupProps>
  }

  interface GlobalDirectives {
    vShow: typeof vShow
    vOn: VOnDirective
    vBind: VModelDirective
    vIf: Directive<any, boolean>
    vOnce: Directive
    vSlot: Directive
  }
}

const rendererOptions = /*@__PURE__*/ extend({ patchProp }, nodeOps)

/**
 * 延迟创建渲染器 - 这使得核心渲染器逻辑可以被 tree-shaking
 * 以防止用户仅从 Vue 导入响应式工具时包含不必要的渲染代码。
 */
let renderer: Renderer<Element | ShadowRoot> | HydrationRenderer

let enabledHydration = false

/**
 * 确保渲染器实例已创建
 * @returns 渲染器实例
 */
function ensureRenderer() {
  return (
    renderer ||
    (renderer = createRenderer<Node, Element | ShadowRoot>(rendererOptions))
  )
}

/**
 * 确保水合渲染器实例已创建
 * @returns 水合渲染器实例
 */
function ensureHydrationRenderer() {
  renderer = enabledHydration
    ? renderer
    : createHydrationRenderer(rendererOptions)
  enabledHydration = true
  return renderer as HydrationRenderer
}

// use explicit type casts here to avoid import() calls in rolled-up d.ts
/**
 * 渲染虚拟 DOM 到指定容器
 * @param vnode 要渲染的虚拟节点
 * @param container 渲染目标容器
 * @param isSVG 是否在 SVG 上下文中渲染
 * @param slotScopeIds 插槽作用域 ID
 * @param optimized 是否启用优化模式
 */
export const render = ((...args) => {
  ensureRenderer().render(...args)
}) as RootRenderFunction<Element | ShadowRoot>

/**
 * 服务端渲染水合功能
 * 将服务端渲染的 HTML 节点与客户端生成的虚拟 DOM 进行绑定
 * @param vnode 虚拟节点
 * @param container 容器元素
 * @param isSVG 是否在 SVG 上下文中水合
 * @param slotScopeIds 插槽作用域 ID
 * @param optimized 是否启用优化模式
 */
export const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args)
}) as RootHydrateFunction

/**
 * 创建一个新的应用实例
 * @param rootComponent 根组件
 * @param rootProps 传递给根组件的属性
 * @returns 应用实例
 * @example
 * ```
 * import { createApp } from 'vue'
 * import App from './App.vue'
 * 
 * const app = createApp(App)
 * app.mount('#app')
 * ```
 */
export const createApp = ((...args) => {
  const app = ensureRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
    injectCompilerOptionsCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (!container) return

    const component = app._component
    if (!isFunction(component) && !component.render && !component.template) {
      // __UNSAFE__
      // Reason: potential execution of JS expressions in in-DOM template.
      // The user must make sure the in-DOM template is trusted. If it's
      // rendered by the server, the template should not contain any user data.
      component.template = container.innerHTML
      // 2.x compat check
      if (__COMPAT__ && __DEV__ && container.nodeType === 1) {
        for (let i = 0; i < (container as Element).attributes.length; i++) {
          const attr = (container as Element).attributes[i]
          if (attr.name !== 'v-cloak' && /^(v-|:|@)/.test(attr.name)) {
            compatUtils.warnDeprecation(
              DeprecationTypes.GLOBAL_MOUNT_CONTAINER,
              null,
            )
            break
          }
        }
      }
    }

    // clear content before mounting
    if (container.nodeType === 1) {
      container.textContent = ''
    }
    const proxy = mount(container, false, resolveRootNamespace(container))
    if (container instanceof Element) {
      container.removeAttribute('v-cloak')
      container.setAttribute('data-v-app', '')
    }
    return proxy
  }

  return app
}) as CreateAppFunction<Element>

/**
 * 创建一个用于服务端渲染的应用实例
 * @param rootComponent 根组件
 * @param rootProps 传递给根组件的属性
 * @returns 应用实例
 */
export const createSSRApp = ((...args) => {
  const app = ensureHydrationRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
    injectCompilerOptionsCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (container) {
      return mount(container, true, resolveRootNamespace(container))
    }
  }

  return app
}) as CreateAppFunction<Element>

/**
 * 解析根容器的命名空间
 * @param container 容器元素
 * @returns 命名空间 ('svg', 'mathml' 或 undefined)
 */
function resolveRootNamespace(
  container: Element | ShadowRoot,
): ElementNamespace {
  if (container instanceof SVGElement) {
    return 'svg'
  }
  if (
    typeof MathMLElement === 'function' &&
    container instanceof MathMLElement
  ) {
    return 'mathml'
  }
}

/**
 * 注入原生标签检查功能
 * @param app 应用实例
 * @internal
 */
function injectNativeTagCheck(app: App) {
  // Inject `isNativeTag`
  // this is used for component name validation (dev only)
  Object.defineProperty(app.config, 'isNativeTag', {
    value: (tag: string) => isHTMLTag(tag) || isSVGTag(tag) || isMathMLTag(tag),
    writable: false,
  })
}

/**
 * 注入编译器选项检查
 * 开发环境下用于检查不支持的编译器选项
 * @param app 应用实例
 * @internal
 */
function injectCompilerOptionsCheck(app: App) {
  if (isRuntimeOnly()) {
    const isCustomElement = app.config.isCustomElement
    Object.defineProperty(app.config, 'isCustomElement', {
      get() {
        return isCustomElement
      },
      set() {
        warn(
          `The \`isCustomElement\` config option is deprecated. Use ` +
            `\`compilerOptions.isCustomElement\` instead.`,
        )
      },
    })

    const compilerOptions = app.config.compilerOptions
    const msg =
      `The \`compilerOptions\` config option is only respected when using ` +
      `a build of Vue.js that includes the runtime compiler (aka "full build"). ` +
      `Since you are using the runtime-only build, \`compilerOptions\` ` +
      `must be passed to \`@vue/compiler-dom\` in the build setup instead.\n` +
      `- For vue-loader: pass it via vue-loader's \`compilerOptions\` loader option.\n` +
      `- For vue-cli: see https://cli.vuejs.org/guide/webpack.html#modifying-options-of-a-loader\n` +
      `- For vite: pass it via @vitejs/plugin-vue options. See https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue#example-for-passing-options-to-vuecompiler-sfc`

    Object.defineProperty(app.config, 'compilerOptions', {
      get() {
        warn(msg)
        return compilerOptions
      },
      set() {
        warn(msg)
      },
    })
  }
}

function normalizeContainer(
  container: Element | ShadowRoot | string,
): Element | ShadowRoot | null {
  if (isString(container)) {
    const res = document.querySelector(container)
    if (__DEV__ && !res) {
      warn(
        `Failed to mount app: mount target selector "${container}" returned null.`,
      )
    }
    return res
  }
  if (
    __DEV__ &&
    window.ShadowRoot &&
    container instanceof window.ShadowRoot &&
    container.mode === 'closed'
  ) {
    warn(
      `mounting on a ShadowRoot with \`{mode: "closed"}\` may lead to unpredictable bugs`,
    )
  }
  return container as any
}

// Custom element support
export {
  defineCustomElement,
  defineSSRCustomElement,
  useShadowRoot,
  useHost,
  VueElement,
  type VueElementConstructor,
  type CustomElementOptions,
} from './apiCustomElement'

// SFC CSS utilities
export { useCssModule } from './helpers/useCssModule'
export { useCssVars } from './helpers/useCssVars'

// DOM-only components
export { Transition, type TransitionProps } from './components/Transition'
export {
  TransitionGroup,
  type TransitionGroupProps,
} from './components/TransitionGroup'

// **Internal** DOM-only runtime directive helpers
export {
  vModelText,
  vModelCheckbox,
  vModelRadio,
  vModelSelect,
  vModelDynamic,
} from './directives/vModel'
export { withModifiers, withKeys } from './directives/vOn'
export { vShow } from './directives/vShow'

import { initVModelForSSR } from './directives/vModel'
import { initVShowForSSR } from './directives/vShow'

let ssrDirectiveInitialized = false

/**
 * @internal
 */
export const initDirectivesForSSR: () => void = __SSR__
  ? () => {
      if (!ssrDirectiveInitialized) {
        ssrDirectiveInitialized = true
        initVModelForSSR()
        initVShowForSSR()
      }
    }
  : NOOP

// re-export everything from core
// h, Component, reactivity API, nextTick, flags & types
export * from '@vue/runtime-core'

export * from './jsx'
