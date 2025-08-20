import {
  type App,
  type Component,
  type ComponentCustomElementInterface,
  type ComponentInjectOptions,
  type ComponentInternalInstance,
  type ComponentObjectPropsOptions,
  type ComponentOptions,
  type ComponentOptionsBase,
  type ComponentOptionsMixin,
  type ComponentProvideOptions,
  type ComponentPublicInstance,
  type ComputedOptions,
  type ConcreteComponent,
  type CreateAppFunction,
  type CreateComponentPublicInstanceWithMixins,
  type DefineComponent,
  type Directive,
  type EmitsOptions,
  type EmitsToProps,
  type ExtractPropTypes,
  type MethodOptions,
  type RenderFunction,
  type SetupContext,
  type SlotsType,
  type VNode,
  type VNodeProps,
  createVNode,
  defineComponent,
  getCurrentInstance,
  nextTick,
  unref,
  warn,
} from '@vue/runtime-core'
import {
  camelize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isPlainObject,
  toNumber,
} from '@vue/shared'
import { createApp, createSSRApp, render } from '.'

// marker for attr removal
const REMOVAL = {}

/**
 * Vue自定义元素构造函数类型
 * @template P - 元素属性类型
 * @typedef {Object} VueElementConstructor
 * @property {Function} new - 创建自定义元素实例的构造函数
 * @param {Record<string, any>} [initialProps] - 初始属性
 * @returns {VueElement & P} - 自定义元素实例
 */
export type VueElementConstructor<P = {}> = {
  new (initialProps?: Record<string, any>): VueElement & P
}

/**
 * 自定义元素选项接口
 * @interface CustomElementOptions
 * @property {string[]} [styles] - 内联CSS样式数组
 * @property {boolean} [shadowRoot] - 是否使用Shadow DOM
 * @property {string} [nonce] - 用于CSP的加密随机数
 * @property {(app: App) => void} [configureApp] - 配置应用实例的回调函数
 */
export interface CustomElementOptions {
  styles?: string[]
  shadowRoot?: boolean
  nonce?: string
  configureApp?: (app: App) => void
}

// defineCustomElement提供与defineComponent相同的类型推断
// 因此以下大多数重载应与defineComponent保持同步

/**
 * 定义自定义元素（重载1：直接传入setup函数）
 * @template Props - 属性类型
 * @template RawBindings - setup函数返回的绑定对象类型
 * @param {(props: Props, ctx: SetupContext) => RawBindings | RenderFunction} setup - 组件的setup函数
 * @param {Object} [options] - 组件和自定义元素选项
 * @param {string} [options.name] - 组件名称
 * @param {boolean} [options.inheritAttrs] - 是否继承非props属性
 * @param {EmitsOptions} [options.emits] - 组件发出的事件
 * @param {CustomElementOptions} [options] - 自定义元素选项
 * @param {(keyof Props)[]} [options.props] - 属性键数组
 * @returns {VueElementConstructor<Props>} - 自定义元素构造函数
 */
export function defineCustomElement<Props, RawBindings = object>(
  setup: (props: Props, ctx: SetupContext) => RawBindings | RenderFunction,
  options?: Pick<ComponentOptions, 'name' | 'inheritAttrs' | 'emits'> &
    CustomElementOptions & {
      props?: (keyof Props)[]
    },
): VueElementConstructor<Props>
export function defineCustomElement<Props, RawBindings = object>(
  setup: (props: Props, ctx: SetupContext) => RawBindings | RenderFunction,
  options?: Pick<ComponentOptions, 'name' | 'inheritAttrs' | 'emits'> &
    CustomElementOptions & {
      props?: ComponentObjectPropsOptions<Props>
    },
): VueElementConstructor<Props>

/**
 * 定义自定义元素（重载2：传入选项对象，从选项推断属性）
 * @template RuntimePropsOptions - 运行时属性选项类型
 * @template PropsKeys - 属性键类型
 * @template RuntimeEmitsOptions - 运行时触发事件选项类型
 * @template EmitsKeys - 事件键类型
 * @template Data - 数据类型
 * @template SetupBindings - setup绑定类型
 * @template Computed - 计算属性类型
 * @template Methods - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template InjectOptions - 注入选项类型
 * @template InjectKeys - 注入键类型
 * @template Slots - 插槽类型
 * @template LocalComponents - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露类型
 * @template Provide - 提供类型
 * @template InferredProps - 推断的属性类型
 * @template ResolvedProps - 解析的属性类型
 * @param {Object} options - 组件和自定义元素选项
 * @param {RuntimePropsOptions | PropsKeys[]} [options.props] - 属性定义
 * @param {CustomElementOptions} [options] - 自定义元素选项
 * @param {ComponentOptionsBase} [options] - 组件基本选项
 * @param {ThisType} [options] - this类型
 * @param {Object} [extraOptions] - 额外的自定义元素选项
 * @returns {VueElementConstructor<ResolvedProps>} - 自定义元素构造函数
 */
// overload 2: defineCustomElement with options object, infer props from options
export function defineCustomElement<
  // props
  RuntimePropsOptions extends
    ComponentObjectPropsOptions = ComponentObjectPropsOptions,
  PropsKeys extends string = string,
  // emits
  RuntimeEmitsOptions extends EmitsOptions = {},
  EmitsKeys extends string = string,
  // other options
  Data = {},
  SetupBindings = {},
  Computed extends ComputedOptions = {},
  Methods extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  InjectOptions extends ComponentInjectOptions = {},
  InjectKeys extends string = string,
  Slots extends SlotsType = {},
  LocalComponents extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  // resolved types
  InferredProps = string extends PropsKeys
    ? ComponentObjectPropsOptions extends RuntimePropsOptions
      ? {}
      : ExtractPropTypes<RuntimePropsOptions>
    : { [key in PropsKeys]?: any },
  ResolvedProps = InferredProps & EmitsToProps<RuntimeEmitsOptions>,
>(
  options: CustomElementOptions & {
    props?: (RuntimePropsOptions & ThisType<void>) | PropsKeys[]
  } & ComponentOptionsBase<
      ResolvedProps,
      SetupBindings,
      Data,
      Computed,
      Methods,
      Mixin,
      Extends,
      RuntimeEmitsOptions,
      EmitsKeys,
      {}, // Defaults
      InjectOptions,
      InjectKeys,
      Slots,
      LocalComponents,
      Directives,
      Exposed,
      Provide
    > &
    ThisType<
      CreateComponentPublicInstanceWithMixins<
        Readonly<ResolvedProps>,
        SetupBindings,
        Data,
        Computed,
        Methods,
        Mixin,
        Extends,
        RuntimeEmitsOptions,
        EmitsKeys,
        {},
        false,
        InjectOptions,
        Slots,
        LocalComponents,
        Directives,
        Exposed
      >
    >,
  extraOptions?: CustomElementOptions,
): VueElementConstructor<ResolvedProps>

/**
 * 定义自定义元素（重载3：从defineComponent的返回值创建）
 * @template T - 组件公共实例构造函数类型
 * @param {T} options - defineComponent返回的组件
 * @param {CustomElementOptions} [extraOptions] - 自定义元素选项
 * @returns {VueElementConstructor} - 自定义元素构造函数
 * @example
 * const MyComponent = defineComponent({ ... })
 * const MyCustomElement = defineCustomElement(MyComponent)
 * customElements.define('my-element', MyCustomElement)
 */
// overload 3: defining a custom element from the returned value of
// `defineComponent`
export function defineCustomElement<
  // this should be `ComponentPublicInstanceConstructor` but that type is not exported
  T extends { new (...args: any[]): ComponentPublicInstance<any> },
>(
  options: T,
  extraOptions?: CustomElementOptions,
): VueElementConstructor<
  T extends DefineComponent<infer P, any, any, any> ? P : unknown
>

/**
 * 定义自定义元素的实现函数
 * @param {any} options - 组件选项或setup函数
 * @param {ComponentOptions} [extraOptions] - 额外的组件选项
 * @param {CreateAppFunction<Element>} [_createApp] - 创建应用的函数
 * @returns {VueElementConstructor} - 自定义元素构造函数
 * @internal
 */
/*! #__NO_SIDE_EFFECTS__ */
export function defineCustomElement(
  options: any,
  extraOptions?: ComponentOptions,
  /**
   * @internal
   */
  _createApp?: CreateAppFunction<Element>,
): VueElementConstructor {
  const Comp = defineComponent(options, extraOptions) as any
  if (isPlainObject(Comp)) extend(Comp, extraOptions)
  class VueCustomElement extends VueElement {
    static def = Comp
    constructor(initialProps?: Record<string, any>) {
      super(Comp, initialProps, _createApp)
    }
  }

  return VueCustomElement
}

/**
 * 定义服务端渲染的自定义元素
 * @param {any} options - 组件选项或setup函数
 * @param {ComponentOptions} [extraOptions] - 额外的组件选项
 * @returns {VueElementConstructor} - 自定义元素构造函数
 * @remarks 用于服务端渲染场景，与defineCustomElement类似，但使用createSSRApp创建应用
 */
/*! #__NO_SIDE_EFFECTS__ */
export const defineSSRCustomElement = ((
  options: any,
  extraOptions?: ComponentOptions,
) => {
  // @ts-expect-error
  return defineCustomElement(options, extraOptions, createSSRApp)
}) as typeof defineCustomElement

const BaseClass = (
  typeof HTMLElement !== 'undefined' ? HTMLElement : class {}
) as typeof HTMLElement

/**
 * Vue自定义元素的基类
 * @class VueElement
 * @extends {BaseClass}
 * @implements {ComponentCustomElementInterface}
 * @description 所有Vue自定义元素的基类，提供了组件实例管理、属性处理等核心功能
 */
type InnerComponentDef = ConcreteComponent & CustomElementOptions

export class VueElement
  extends BaseClass
  implements ComponentCustomElementInterface
{
  /**
   * 标记这是一个Vue自定义元素
   * @type {boolean}
   * @public
   */
  _isVueCE = true
  /**
   * 组件内部实例
   * @type {ComponentInternalInstance | null}
   * @private
   */
  _instance: ComponentInternalInstance | null = null
  /**
   * Vue应用实例
   * @type {App | null}
   * @private
   */
  _app: App | null = null
  /**
   * 根元素，可能是元素本身或ShadowRoot
   * @type {Element | ShadowRoot}
   * @private
   */
  _root: Element | ShadowRoot
  /**
   * 用于CSP的加密随机数
   * @type {string | undefined}
   * @private
   */
  _nonce: string | undefined = this._def.nonce

  /**
   *  teleport目标元素
   * @type {HTMLElement | undefined}
   * @private
   */
  _teleportTarget?: HTMLElement

  /**
   * 是否已连接到文档
   * @type {boolean}
   * @private
   */
  private _connected = false
  /**
   * 组件是否已解析
   * @type {boolean}
   * @private
   */
  private _resolved = false
  /**
   * 需要转换为数字类型的属性
   * @type {Record<string, true> | null}
   * @private
   */
  private _numberProps: Record<string, true> | null = null
  /**
   * 样式子元素集合
   * @type {WeakSet}
   * @private
   */
  private _styleChildren = new WeakSet()
  /**
   * 等待解析的Promise
   * @type {Promise<void> | undefined}
   * @private
   */
  private _pendingResolve: Promise<void> | undefined
  /**
   * 父Vue自定义元素
   * @type {VueElement | undefined}
   * @private
   */
  private _parent: VueElement | undefined
  /**
   * 样式元素数组（仅开发环境）
   * @type {HTMLStyleElement[] | undefined}
   * @private
   * @devonly
   */
  private _styles?: HTMLStyleElement[]
  /**
   * 子元素样式映射（仅开发环境）
   * @type {Map<string, HTMLStyleElement[]> | undefined}
   * @private
   * @devonly
   */
  private _childStyles?: Map<string, HTMLStyleElement[]>
  /**
   * 突变观察者，用于监听属性变化
   * @type {MutationObserver | null | undefined}
   * @private
   */
  private _ob?: MutationObserver | null = null
  /**
   * 插槽节点集合
   * @type {Record<string, Node[]> | undefined}
   * @private
   */
  private _slots?: Record<string, Node[] >

  /**
   * 构造函数
   * @param {InnerComponentDef} _def - 组件定义，可能是异步包装器
   * @param {Record<string, any>} [_props={}] - 初始属性
   * @param {CreateAppFunction<Element>} [_createApp=createApp] - 创建应用的函数
   * @description 初始化自定义元素，设置根元素和Shadow DOM
   */
  constructor(
    /**
     * 组件定义 - 注意这可能是一个AsyncWrapper，当解析时this._def将被内部组件覆盖
     */
    private _def: InnerComponentDef,
    private _props: Record<string, any> = {},
    private _createApp: CreateAppFunction<Element> = createApp,
  ) {
    super()
    if (this.shadowRoot && _createApp !== createApp) {
      this._root = this.shadowRoot
    } else {
      if (__DEV__ && this.shadowRoot) {
        warn(
          `Custom element has pre-rendered declarative shadow root but is not ` +
            `defined as hydratable. Use \`defineSSRCustomElement\`.`
        ,
        )
      }
      if (_def.shadowRoot !== false) {
        this.attachShadow({ mode: 'open' })
        this._root = this.shadowRoot!
      } else {
        this._root = this
      }
    }
  }

  /**
   * 当元素连接到文档时调用的生命周期方法
   * @returns {void}
   * @description 处理元素连接逻辑，包括解析插槽、设置连接状态和查找父Vue元素
   */
  connectedCallback(): void {
    // 避免在未连接时解析组件
    if (!this.isConnected) return

    // 如果尚未解析且没有shadowRoot，则解析插槽
    if (!this.shadowRoot && !this._resolved) {
      this._parseSlots()
    }
    this._connected = true

    // 查找最近的Vue自定义元素父节点，用于provide/inject
    let parent: Node | null = this
    while (
      (parent = parent && (parent.parentNode || (parent as ShadowRoot).host))
    ) {
      if (parent instanceof VueElement) {
        this._parent = parent
        break
      }
    }

    if (!this._instance) {
      if (this._resolved) {
        this._mount(this._def)
      } else {
        if (parent && parent._pendingResolve) {
          this._pendingResolve = parent._pendingResolve.then(() => {
            this._pendingResolve = undefined
            this._resolveDef()
          })
        } else {
          this._resolveDef()
        }
      }
    }
  }

  /**
   * 设置父组件
   * @param {VueElement | undefined} [parent=this._parent] - 父Vue元素
   * @private
   * @description 设置组件实例的父组件，并继承父组件上下文
   */
  private _setParent(parent = this._parent) {
    if (parent) {
      this._instance!.parent = parent._instance
      this._inheritParentContext(parent)
    }
  }

  /**
   * 继承父组件上下文
   * @param {VueElement | undefined} [parent=this._parent] - 父Vue元素
   * @private
   * @description 继承父组件的provide上下文，使注入能够正常工作
   */
  private _inheritParentContext(parent = this._parent) {
    // #13212, the provides object of the app context must inherit the provides
    // object from the parent element so we can inject values from both places
    if (parent && this._app) {
      Object.setPrototypeOf(
        this._app._context.provides,
        parent._instance!.provides,
      )
    }
  }

  /**
   * 当元素从文档中移除时调用的生命周期方法
   * @returns {void}
   * @description 处理元素断开连接逻辑，包括清理观察者和卸载组件
   */
  disconnectedCallback(): void {
    this._connected = false
    nextTick(() => {
      if (!this._connected) {
        if (this._ob) {
          this._ob.disconnect()
          this._ob = null
        }
        // 卸载
        this._app && this._app.unmount()
        if (this._instance) this._instance.ce = undefined
        this._app = this._instance = null
      }
    })
  }

  /**
   * 解析内部组件定义（处理可能的异步组件）
   * @private
   * @description 解析组件定义，设置初始属性，监听属性变化，并在解析完成后挂载组件
   */
  private _resolveDef() {
    if (this._pendingResolve) {
      return
    }

    // set initial attrs
    for (let i = 0; i < this.attributes.length; i++) {
      this._setAttr(this.attributes[i].name)
    }

    // watch future attr changes
    this._ob = new MutationObserver(mutations => {
      for (const m of mutations) {
        this._setAttr(m.attributeName!)
      }
    })

    this._ob.observe(this, { attributes: true })

    const resolve = (def: InnerComponentDef, isAsync = false) => {
      this._resolved = true
      this._pendingResolve = undefined

      const { props, styles } = def

      // cast Number-type props set before resolve
      let numberProps
      if (props && !isArray(props)) {
        for (const key in props) {
          const opt = props[key]
          if (opt === Number || (opt && opt.type === Number)) {
            if (key in this._props) {
              this._props[key] = toNumber(this._props[key])
            }
            ;(numberProps || (numberProps = Object.create(null)))[
              camelize(key)
            ] = true
          }
        }
      }
      this._numberProps = numberProps
      this._resolveProps(def)

      // apply CSS
      if (this.shadowRoot) {
        this._applyStyles(styles)
      } else if (__DEV__ && styles) {
        warn(
          'Custom element style injection is not supported when using ' +
            'shadowRoot: false',
        )
      }

      // initial mount
      this._mount(def)
    }

    const asyncDef = (this._def as ComponentOptions).__asyncLoader
    if (asyncDef) {
      this._pendingResolve = asyncDef().then((def: InnerComponentDef) => {
        def.configureApp = this._def.configureApp
        resolve((this._def = def), true)
      })
    } else {
      resolve(this._def)
    }
  }

  /**
   * 挂载组件到自定义元素
   * @param {InnerComponentDef} def - 组件定义
   * @private
   * @description 创建应用实例，配置应用，创建虚拟节点并挂载组件
   */
  private _mount(def: InnerComponentDef) {
    if ((__DEV__ || __FEATURE_PROD_DEVTOOLS__) && !def.name) {
      // @ts-expect-error
      def.name = 'VueElement'
    }
    this._app = this._createApp(def)
    // inherit before configureApp to detect context overwrites
    this._inheritParentContext()
    if (def.configureApp) {
      def.configureApp(this._app)
    }
    this._app._ceVNode = this._createVNode()
    this._app.mount(this._root)

    // apply expose after mount
    const exposed = this._instance && this._instance.exposed
    if (!exposed) return
    for (const key in exposed) {
      if (!hasOwn(this, key)) {
        // exposed properties are readonly
        Object.defineProperty(this, key, {
          // unwrap ref to be consistent with public instance behavior
          get: () => unref(exposed[key]),
        })
      } else if (__DEV__) {
        warn(`Exposed property "${key}" already exists on custom element.`)
      }
    }
  }

  /**
   * 解析组件属性
   * @param {InnerComponentDef} def - 组件定义
   * @private
   * @description 处理初始属性，为属性定义getter/setter
   */
  private _resolveProps(def: InnerComponentDef) {
    const { props } = def
    const declaredPropKeys = isArray(props) ? props : Object.keys(props || {})

    // check if there are props set pre-upgrade or connect
    for (const key of Object.keys(this)) {
      if (key[0] !== '_' && declaredPropKeys.includes(key)) {
        this._setProp(key, this[key as keyof this])
      }
    }

    // defining getter/setters on prototype
    for (const key of declaredPropKeys.map(camelize)) {
      Object.defineProperty(this, key, {
        get() {
          return this._getProp(key)
        },
        set(val) {
          this._setProp(key, val, true, true)
        },
      })
    }
  }

  protected _setAttr(key: string): void {
    if (key.startsWith('data-v-')) return
    const has = this.hasAttribute(key)
    let value = has ? this.getAttribute(key) : REMOVAL
    const camelKey = camelize(key)
    if (has && this._numberProps && this._numberProps[camelKey]) {
      value = toNumber(value)
    }
    this._setProp(camelKey, value, false, true)
  }

  /**
   * @internal
   */
  protected _getProp(key: string): any {
    return this._props[key]
  }

  /**
   * @internal
   */
  _setProp(
    key: string,
    val: any,
    shouldReflect = true,
    shouldUpdate = false,
  ): void {
    if (val !== this._props[key]) {
      if (val === REMOVAL) {
        delete this._props[key]
      } else {
        this._props[key] = val
        // support set key on ceVNode
        if (key === 'key' && this._app) {
          this._app._ceVNode!.key = val
        }
      }
      if (shouldUpdate && this._instance) {
        this._update()
      }
      // reflect
      if (shouldReflect) {
        const ob = this._ob
        ob && ob.disconnect()
        if (val === true) {
          this.setAttribute(hyphenate(key), '')
        } else if (typeof val === 'string' || typeof val === 'number') {
          this.setAttribute(hyphenate(key), val + '')
        } else if (!val) {
          this.removeAttribute(hyphenate(key))
        }
        ob && ob.observe(this, { attributes: true })
      }
    }
  }

  /**
   * 更新组件
   * @private
   * @description 创建新的虚拟节点并重新渲染组件
   */
  private _update() {
    const vnode = this._createVNode()
    if (this._app) vnode.appContext = this._app._context
    render(vnode, this._root)
  }

  /**
   * 创建虚拟节点
   * @returns {VNode<any, any>} - 创建的虚拟节点
   * @private
   * @description 为组件创建虚拟节点，并设置组件实例回调
   */
  private _createVNode(): VNode<any, any> {
    const baseProps: VNodeProps = {}
    if (!this.shadowRoot) {
      baseProps.onVnodeMounted = baseProps.onVnodeUpdated =
        this._renderSlots.bind(this)
    }
    const vnode = createVNode(this._def, extend(baseProps, this._props))
    if (!this._instance) {
      vnode.ce = instance => {
        this._instance = instance
        instance.ce = this
        instance.isCE = true // for vue-i18n backwards compat
        // HMR
        if (__DEV__) {
          instance.ceReload = newStyles => {
            // always reset styles
            if (this._styles) {
              this._styles.forEach(s => this._root.removeChild(s))
              this._styles.length = 0
            }
            this._applyStyles(newStyles)
            this._instance = null
            this._update()
          }
        }

        const dispatch = (event: string, args: any[]) => {
          this.dispatchEvent(
            new CustomEvent(
              event,
              isPlainObject(args[0])
                ? extend({ detail: args }, args[0])
                : { detail: args },
            ),
          )
        }

        // intercept emit
        instance.emit = (event: string, ...args: any[]) => {
          // dispatch both the raw and hyphenated versions of an event
          // to match Vue behavior
          dispatch(event, args)
          if (hyphenate(event) !== event) {
            dispatch(hyphenate(event), args)
          }
        }

        this._setParent()
      }
    }
    return vnode
  }

  /**
   * 应用CSS样式
   * @param {string[] | undefined} styles - CSS样式字符串数组
   * @param {ConcreteComponent} [owner] - 样式所属组件
   * @private
   * @description 将CSS样式应用到自定义元素的Shadow DOM中
   */
  private _applyStyles(
    styles: string[] | undefined,
    owner?: ConcreteComponent,
  ) {
    if (!styles) return
    if (owner) {
      if (owner === this._def || this._styleChildren.has(owner)) {
        return
      }
      this._styleChildren.add(owner)
    }
    const nonce = this._nonce
    for (let i = styles.length - 1; i >= 0; i--) {
      const s = document.createElement('style')
      if (nonce) s.setAttribute('nonce', nonce)
      s.textContent = styles[i]
      this.shadowRoot!.prepend(s)
      // record for HMR
      if (__DEV__) {
        if (owner) {
          if (owner.__hmrId) {
            if (!this._childStyles) this._childStyles = new Map()
            let entry = this._childStyles.get(owner.__hmrId)
            if (!entry) {
              this._childStyles.set(owner.__hmrId, (entry = []))
            }
            entry.push(s)
          }
        } else {
          ;(this._styles || (this._styles = [])).push(s)
        }
      }
    }
  }

  /**
   * 解析插槽内容
   * @private
   * @description 当shadowRoot为false时调用，解析元素的子节点作为插槽内容
   */
  private _parseSlots() {
    const slots: VueElement['_slots'] = (this._slots = {})
    let n
    while ((n = this.firstChild)) {
      const slotName =
        (n.nodeType === 1 && (n as Element).getAttribute('slot')) || 'default'
      ;(slots[slotName] || (slots[slotName] = [])).push(n)
      this.removeChild(n)
    }
  }

  /**
   * 渲染插槽内容
   * @private
   * @description 当shadowRoot为false时调用，将解析的插槽内容渲染到对应的slot元素位置
   */
  private _renderSlots() {
    const outlets = (this._teleportTarget || this).querySelectorAll('slot')
    const scopeId = this._instance!.type.__scopeId
    for (let i = 0; i < outlets.length; i++) {
      const o = outlets[i] as HTMLSlotElement
      const slotName = o.getAttribute('name') || 'default'
      const content = this._slots![slotName]
      const parent = o.parentNode!
      if (content) {
        for (const n of content) {
          // for :slotted css
          if (scopeId && n.nodeType === 1) {
            const id = scopeId + '-s'
            const walker = document.createTreeWalker(n, 1)
            ;(n as Element).setAttribute(id, '')
            let child
            while ((child = walker.nextNode())) {
              ;(child as Element).setAttribute(id, '')
            }
          }
          parent.insertBefore(n, o)
        }
      } else {
        while (o.firstChild) parent.insertBefore(o.firstChild, o)
      }
      parent.removeChild(o)
    }
  }

  /**
   * 注入子组件样式
   * @param {ConcreteComponent & CustomElementOptions} comp - 子组件
   * @internal
   * @description 为子组件应用样式
   */
  _injectChildStyle(comp: ConcreteComponent & CustomElementOptions): void {
    this._applyStyles(comp.styles, comp)
  }

  /**
   * 移除子组件样式
   * @param {ConcreteComponent} comp - 子组件
   * @internal
   * @description 移除子组件的样式（仅开发环境）
   */
  _removeChildStyle(comp: ConcreteComponent): void {
    if (__DEV__) {
      this._styleChildren.delete(comp)
      if (this._childStyles && comp.__hmrId) {
        // clear old styles
        const oldStyles = this._childStyles.get(comp.__hmrId)
        if (oldStyles) {
          oldStyles.forEach(s => this._root.removeChild(s))
          oldStyles.length = 0
        }
      }
    }
  }
}

export function useHost(caller?: string): VueElement | null {
  const instance = getCurrentInstance()
  const el = instance && (instance.ce as VueElement)
  if (el) {
    return el
  } else if (__DEV__) {
    if (!instance) {
      warn(
        `${caller || 'useHost'} called without an active component instance.`,
      )
    } else {
      warn(
        `${caller || 'useHost'} can only be used in components defined via ` +
          `defineCustomElement.`,
      )
    }
  }
  return null
}

/**
 * Retrieve the shadowRoot of the current custom element. Only usable in setup()
 * of a `defineCustomElement` component.
 */
export function useShadowRoot(): ShadowRoot | null {
  const el = __DEV__ ? useHost('useShadowRoot') : useHost()
  return el && el.shadowRoot
}
