// 这些标签配置在compiler-dom和runtime-dom之间共享
// 因此必须提取到shared中，以避免在两者之间创建依赖关系
import { makeMap } from './makeMap' // 导入makeMap工具函数，用于创建高效的映射函数

// HTML标签列表，来源于 https://developer.mozilla.org/en-US/docs/Web/HTML/Element
const HTML_TAGS =
  'html,body,base,head,link,meta,style,title,address,article,aside,footer,' +
  'header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,' +
  'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' +
  'data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,' +
  'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' +
  'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' +
  'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' +
  'option,output,progress,select,textarea,details,dialog,menu,' +
  'summary,template,blockquote,iframe,tfoot'

// SVG标签列表，来源于 https://developer.mozilla.org/en-US/docs/Web/SVG/Element
const SVG_TAGS =
  'svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,' +
  'defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,' +
  'feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,' +
  'feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,' +
  'feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,' +
  'fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,' +
  'foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,' +
  'mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,' +
  'polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,' +
  'text,textPath,title,tspan,unknown,use,view'

// MathML标签列表，来源于 https://www.w3.org/TR/mathml4/ (不包含内容元素)
const MATH_TAGS =
  'annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,' +
  'merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,' +
  'mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,' +
  'mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,' +
  'msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics'

// 空标签列表（没有闭合标签的HTML元素）
const VOID_TAGS =
  'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'

/**
 * 检查一个标签是否为HTML标签
 * @param key 标签名
 * @returns 是否为HTML标签
 * @注意 仅用于编译器
 * @注意 除非在`__DEV__`标志后面，否则不要在运行时代码路径中使用
 */
export const isHTMLTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(HTML_TAGS)
/**
 * 检查一个标签是否为SVG标签
 * @param key 标签名
 * @returns 是否为SVG标签
 * @注意 仅用于编译器
 * @注意 除非在`__DEV__`标志后面，否则不要在运行时代码路径中使用
 */
export const isSVGTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(SVG_TAGS)
/**
 * 检查一个标签是否为MathML标签
 * @param key 标签名
 * @returns 是否为MathML标签
 * @注意 仅用于编译器
 * @注意 除非在`__DEV__`标志后面，否则不要在运行时代码路径中使用
 */
export const isMathMLTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(MATH_TAGS)
/**
 * 检查一个标签是否为空标签（没有闭合标签的HTML元素）
 * @param key 标签名
 * @returns 是否为空标签
 * @注意 仅用于编译器
 * @注意 除非在`__DEV__`标志后面，否则不要在运行时代码路径中使用
 */
export const isVoidTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(VOID_TAGS)
