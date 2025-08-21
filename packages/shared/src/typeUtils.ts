/**
 * 美化类型显示的工具类型
 * 用于优化复杂类型在IDE中的显示，使其更易读
 * @template T 输入类型
 * @example
 * ```
 * type ComplexType = { a: number } & { b: string };
 * type Prettified = Prettify<ComplexType>; // { a: number; b: string }
 * ```
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

/**
 * 将联合类型转换为交叉类型
 * @template U 输入的联合类型
 * @returns 转换后的交叉类型
 * @example
 * ```
 * type Union = { a: number } | { b: string };
 * type Intersection = UnionToIntersection<Union>; // { a: number } & { b: string }
 * ```
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

/**
 * 使类型的键变为必需的，但保留undefined值
 * 与TypeScript内置的Required不同，此类型允许属性值为undefined
 * @template T 输入类型
 * @example
 * ```
 * type PartialType = { a?: number; b?: string };
 * type LooseRequiredType = LooseRequired<PartialType>; // { a: number | undefined; b: string | undefined }
 * ```
 */
export type LooseRequired<T> = { [P in keyof (T & Required<T>)]: T[P] }

/**
 * 检查类型是否为any
 * 如果类型T接受any类型，则输出Y，否则输出N
 * @template T 要检查的类型
 * @template Y 如果T是any类型时的输出类型
 * @template N 如果T不是any类型时的输出类型
 * @example
 * ```
 * type IsAnyType = IfAny<any, true, false>; // true
 * type IsNotAnyType = IfAny<string, true, false>; // false
 * ```
 */
export type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N

/**
 * 检查类型是否是键值对对象
 * @template T 要检查的类型
 * @template K 键的类型，默认为string
 * @returns 如果T是键值对对象且所有键都是K类型，则返回true，否则返回false
 * @example
 * ```
 * type IsObject = IsKeyValues<{ a: number; b: string }>; // true
 * type IsNotObject = IsKeyValues<number>; // false
 * type WithNonStringKeys = IsKeyValues<{ [key: number]: string }, number>; // true
 * ```
 */
export type IsKeyValues<T, K = string> = IfAny<
  T, 
  false, 
  T extends object ? (keyof T extends K ? true : false) : false
>

/**
 * 提取函数重载的参数类型
 * 用于从具有多个重载的函数类型中提取参数类型
 * @template T 输入的函数类型
 * @returns 函数重载的参数类型组成的元组
 * @example
 * ```
 * function func(a: number): void;
 * function func(a: string, b: number): void;
 * type FuncParams = OverloadParameters<typeof func>; // [number] | [string, number]
 * ```
 */
export type OverloadParameters<T extends (...args: any[]) => any> = Parameters<
  OverloadUnion<T>
>

/**
 * 提取函数重载的属性
 * 内部工具类型，用于OverloadUnionRecursive
 * @template TOverload 输入的函数重载类型
 */
type OverloadProps<TOverload> = Pick<TOverload, keyof TOverload>

/**
 * 递归处理函数重载联合类型
 * 内部工具类型，用于解析函数的所有重载签名
 * @template TOverload 输入的函数重载类型
 * @template TPartialOverload 部分重载类型，默认为unknown
 */
type OverloadUnionRecursive<
  TOverload,
  TPartialOverload = unknown,
> = TOverload extends (...args: infer TArgs) => infer TReturn
  ? TPartialOverload extends TOverload
    ? never
    :
        | OverloadUnionRecursive<
            TPartialOverload & TOverload,
            TPartialOverload &
              ((...args: TArgs) => TReturn) &
              OverloadProps<TOverload>
          >
        | ((...args: TArgs) => TReturn)
  : never

/**
 * 处理函数重载类型为联合类型
 * 内部工具类型，用于OverloadParameters
 * @template TOverload 输入的函数重载类型
 */
type OverloadUnion<TOverload extends (...args: any[]) => any> = Exclude<
  OverloadUnionRecursive<(() => never) & TOverload>,
  TOverload extends () => never ? never : () => never
>
