// 导入makeMap工具函数，用于创建高效的映射函数
import { makeMap } from './makeMap'

/**
 * 在客户端，我们只需要为名称与对应DOM属性不同的布尔属性提供特殊处理：
 * - itemscope -> 无对应DOM属性
 * - allowfullscreen -> allowFullscreen
 * - formnovalidate -> formNoValidate
 * - ismap -> isMap
 * - nomodule -> noModule
 * - novalidate -> noValidate
 * - readonly -> readOnly
 */
// 特殊布尔属性列表，这些属性在DOM中的名称与在Vue中的名称不同
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`
/**
 * 检查一个属性是否为特殊布尔属性
 * @param key 属性名
 * @returns 是否为特殊布尔属性
 */
export const isSpecialBooleanAttr: (key: string) => boolean = 
  /*@__PURE__*/ makeMap(specialBooleanAttrs)

/**
 * 在SSR期间需要完整列表以生成正确的初始标记
 */
/**
 * 检查一个属性是否为布尔属性
 * @param key 属性名
 * @returns 是否为布尔属性
 */
export const isBooleanAttr: (key: string) => boolean = /*@__PURE__*/ makeMap(
  specialBooleanAttrs +
    `,async,autofocus,autoplay,controls,default,defer,disabled,hidden,` +
    `inert,loop,open,required,reversed,scoped,seamless,` +
    `checked,muted,multiple,selected`,
)

/**
 * 如果值为真值或空字符串，则应包含布尔属性
 * 例如：`<select multiple>` 编译为 `{ multiple: '' }`
 */
export function includeBooleanAttr(value: unknown): boolean {
  return !!value || value === ''
}

// 匹配不安全属性名的正则表达式，包含各种分隔符和引号
const unsafeAttrCharRE = /[>/="'\u0009\u000a\u000c\u0020]/
// 属性验证缓存，用于缓存属性名的安全性检查结果
const attrValidationCache: Record<string, boolean> = {}

/**
 * 检查属性名在SSR中是否安全
 * @param name 属性名
 * @returns 是否安全
 */
export function isSSRSafeAttrName(name: string): boolean {
  if (attrValidationCache.hasOwnProperty(name)) {
    return attrValidationCache[name]
  }
  const isUnsafe = unsafeAttrCharRE.test(name)
  if (isUnsafe) {
    console.error(`unsafe attribute name: ${name}`)
  }
  return (attrValidationCache[name] = !isUnsafe)
}

/**
 * 属性映射表，将Vue props名称映射到HTML属性名称
 */
export const propsToAttrMap: Record<string, string | undefined> = {
  acceptCharset: 'accept-charset',
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv',
}

/**
 * 已知属性，用于运行时静态节点的字符串化
 * 这样我们就不会字符串化那些不能从HTML设置的绑定
 * 别忘了允许 `data-*` 和 `aria-*` 属性！
 * 从 https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes 生成
 */
/**
 * 检查一个属性是否为已知的HTML属性
 * @param key 属性名
 * @returns 是否为已知HTML属性
 */
export const isKnownHtmlAttr: (key: string) => boolean = /*@__PURE__*/ makeMap(
  `accept,accept-charset,accesskey,action,align,allow,alt,async,` +
    `autocapitalize,autocomplete,autofocus,autoplay,background,bgcolor,` +
    `border,buffered,capture,challenge,charset,checked,cite,class,code,` +
    `codebase,color,cols,colspan,content,contenteditable,contextmenu,controls,` +
    `coords,crossorigin,csp,data,datetime,decoding,default,defer,dir,dirname,` +
    `disabled,download,draggable,dropzone,enctype,enterkeyhint,for,form,` +
    `formaction,formenctype,formmethod,formnovalidate,formtarget,headers,` +
    `height,hidden,high,href,hreflang,http-equiv,icon,id,importance,inert,integrity,` +
    `ismap,itemprop,keytype,kind,label,lang,language,loading,list,loop,low,` +
    `manifest,max,maxlength,minlength,media,min,multiple,muted,name,novalidate,` +
    `open,optimum,pattern,ping,placeholder,poster,preload,radiogroup,readonly,` +
    `referrerpolicy,rel,required,reversed,rows,rowspan,sandbox,scope,scoped,` +
    `selected,shape,size,sizes,slot,span,spellcheck,src,srcdoc,srclang,srcset,` +
    `start,step,style,summary,tabindex,target,title,translate,type,usemap,` +
    `value,width,wrap`,
)

/**
 * 从 https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute 生成
 */
/**
 * 检查一个属性是否为已知的SVG属性
 * @param key 属性名
 * @returns 是否为已知SVG属性
 */
export const isKnownSvgAttr: (key: string) => boolean = /*@__PURE__*/ makeMap(
  `xmlns,accent-height,accumulate,additive,alignment-baseline,alphabetic,amplitude,` +
    `arabic-form,ascent,attributeName,attributeType,azimuth,baseFrequency,` +
    `baseline-shift,baseProfile,bbox,begin,bias,by,calcMode,cap-height,class,` +
    `clip,clipPathUnits,clip-path,clip-rule,color,color-interpolation,` +
    `color-interpolation-filters,color-profile,color-rendering,` +
    `contentScriptType,contentStyleType,crossorigin,cursor,cx,cy,d,decelerate,` +
    `descent,diffuseConstant,direction,display,divisor,dominant-baseline,dur,dx,` +
    `dy,edgeMode,elevation,enable-background,end,exponent,fill,fill-opacity,` +
    `fill-rule,filter,filterRes,filterUnits,flood-color,flood-opacity,` +
    `font-family,font-size,font-size-adjust,font-stretch,font-style,` +
    `font-variant,font-weight,format,from,fr,fx,fy,g1,g2,glyph-name,` +
    `glyph-orientation-horizontal,glyph-orientation-vertical,glyphRef,` +
    `gradientTransform,gradientUnits,hanging,height,href,hreflang,horiz-adv-x,` +
    `horiz-origin-x,id,ideographic,image-rendering,in,in2,intercept,k,k1,k2,k3,` +
    `k4,kernelMatrix,kernelUnitLength,kerning,keyPoints,keySplines,keyTimes,` +
    `lang,lengthAdjust,letter-spacing,lighting-color,limitingConeAngle,local,` +
    `marker-end,marker-mid,marker-start,markerHeight,markerUnits,markerWidth,` +
    `mask,maskContentUnits,maskUnits,mathematical,max,media,method,min,mode,` +
    `name,numOctaves,offset,opacity,operator,order,orient,orientation,origin,` +
    `overflow,overline-position,overline-thickness,panose-1,paint-order,path,` +
    `pathLength,patternContentUnits,patternTransform,patternUnits,ping,` +
    `pointer-events,points,pointsAtX,pointsAtY,pointsAtZ,preserveAlpha,` +
    `preserveAspectRatio,primitiveUnits,r,radius,referrerPolicy,refX,refY,rel,` +
    `rendering-intent,repeatCount,repeatDur,requiredExtensions,requiredFeatures,` +
    `restart,result,rotate,rx,ry,scale,seed,shape-rendering,slope,spacing,` +
    `specularConstant,specularExponent,speed,spreadMethod,startOffset,` +
    `stdDeviation,stemh,stemv,stitchTiles,stop-color,stop-opacity,` +
    `strikethrough-position,strikethrough-thickness,string,stroke,` +
    `stroke-dasharray,stroke-dashoffset,stroke-linecap,stroke-linejoin,` +
    `stroke-miterlimit,stroke-opacity,stroke-width,style,surfaceScale,` +
    `systemLanguage,tabindex,tableValues,target,targetX,targetY,text-anchor,` +
    `text-decoration,text-rendering,textLength,to,transform,transform-origin,` +
    `type,u1,u2,underline-position,underline-thickness,unicode,unicode-bidi,` +
    `unicode-range,units-per-em,v-alphabetic,v-hanging,v-ideographic,` +
    `v-mathematical,values,vector-effect,version,vert-adv-y,vert-origin-x,` +
    `vert-origin-y,viewBox,viewTarget,visibility,width,widths,word-spacing,` +
    `writing-mode,x,x-height,x1,x2,xChannelSelector,xlink:actuate,xlink:arcrole,` +
    `xlink:href,xlink:role,xlink:show,xlink:title,xlink:type,xmlns:xlink,xml:base,xml:lang,` +
    `xml:space,y,y1,y2,yChannelSelector,z,zoomAndPan`,
)

/**
 * 从 https://developer.mozilla.org/en-US/docs/Web/MathML/Attribute 生成
 */
/**
 * 检查一个属性是否为已知的MathML属性
 * @param key 属性名
 * @returns 是否为已知MathML属性
 */
export const isKnownMathMLAttr: (key: string) => boolean =
  /*@__PURE__*/ makeMap(
    `accent,accentunder,actiontype,align,alignmentscope,altimg,altimg-height,` +
      `altimg-valign,altimg-width,alttext,bevelled,close,columnsalign,columnlines,` +
      `columnspan,denomalign,depth,dir,display,displaystyle,encoding,` +
      `equalcolumns,equalrows,fence,fontstyle,fontweight,form,frame,framespacing,` +
      `groupalign,height,href,id,indentalign,indentalignfirst,indentalignlast,` +
      `indentshift,indentshiftfirst,indentshiftlast,indextype,justify,` +
      `largetop,largeop,lquote,lspace,mathbackground,mathcolor,mathsize,` +
      `mathvariant,maxsize,minlabelspacing,mode,other,overflow,position,` +
      `rowalign,rowlines,rowspan,rquote,rspace,scriptlevel,scriptminsize,` +
      `scriptsizemultiplier,selection,separator,separators,shift,side,` +
      `src,stackalign,stretchy,subscriptshift,superscriptshift,symmetric,` +
      `voffset,width,widths,xlink:href,xlink:show,xlink:type,xmlns`,
  )

/**
 * 检查属性值是否可渲染
 * @param value 属性值
 * @returns 是否可渲染
 * 在服务器渲染器和运行时核心水合逻辑之间共享
 */
export function isRenderableAttrValue(value: unknown): boolean {
  if (value == null) {
    return false
  }
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
}
