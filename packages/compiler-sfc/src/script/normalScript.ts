// 常规脚本处理模块
// 此模块用于处理单文件组件(SFC)中的常规脚本块
// 主要功能包括分析脚本绑定、重写默认导出、生成CSS变量代码等

import { analyzeScriptBindings } from './analyzeScriptBindings'
import type { ScriptCompileContext } from './context'
import MagicString from 'magic-string'
import { rewriteDefaultAST } from '../rewriteDefault'
import { genNormalScriptCssVarsCode } from '../style/cssVars'
import type { SFCScriptBlock } from '../parse'

/**
 * 常规脚本默认变量名
 * 用于在重写默认导出时使用的临时变量名
 */
export const normalScriptDefaultVar = `__default__`

/**
 * 处理常规脚本块
 * @param ctx - 脚本编译上下文
 * @param scopeId - 组件作用域ID
 * @returns 处理后的脚本块
 */
export function processNormalScript(
  ctx: ScriptCompileContext,
  scopeId: string,
): SFCScriptBlock {
  const script = ctx.descriptor.script!
  // 不处理非JS/TS脚本块
  if (script.lang && !ctx.isJS && !ctx.isTS) {
    return script
  }
  try {
    let content = script.content
    let map = script.map
    const scriptAst = ctx.scriptAst!
    // 分析脚本绑定
    const bindings = analyzeScriptBindings(scriptAst.body)
    const { cssVars } = ctx.descriptor
    const { genDefaultAs, isProd } = ctx.options

    // 如果有CSS变量或需要生成默认导出别名
    if (cssVars.length || genDefaultAs) {
      const defaultVar = genDefaultAs || normalScriptDefaultVar
      const s = new MagicString(content)
      // 重写默认导出AST
      rewriteDefaultAST(scriptAst.body, s, defaultVar)
      content = s.toString()
      // 生成CSS变量代码（非SSR模式）
      if (cssVars.length && !ctx.options.templateOptions?.ssr) {
        content += genNormalScriptCssVarsCode(
          cssVars,
          bindings,
          scopeId,
          !!isProd,
          defaultVar,
        )
      }
      // 如果没有指定默认导出别名，则添加默认导出
      if (!genDefaultAs) {
        content += `
export default ${defaultVar}`
      }
    }
    return {
      ...script,
      content,
      map,
      bindings,
      scriptAst: scriptAst.body,
    }
  } catch (e: any) {
    // 解析失败时静默回退，因为用户可能使用自定义Babel语法
    return script
  }
}
