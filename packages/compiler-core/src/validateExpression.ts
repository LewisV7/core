/**
 * 表达式验证工具
 * 此文件提供了在浏览器环境中验证Vue模板表达式的功能
 */
import type { SimpleExpressionNode } from './ast'
import type { TransformContext } from './transform'
import { ErrorCodes, createCompilerError } from './errors'

/**
 * 禁止在表达式中使用的关键字正则表达式
 * 这些关键字不应出现在表达式中，但允许使用运算符如'typeof'、'instanceof'和'in'
 */
const prohibitedKeywordRE = new RegExp(
  '\\b' +
    (
      'arguments,await,break,case,catch,class,const,continue,debugger,default,' +
      'delete,do,else,export,extends,finally,for,function,if,import,let,new,' +
      'return,super,switch,throw,try,var,void,while,with,yield'
    )
      .split(',')
      .join('\\b|\\b') +
    '\\b',
)

/**
 * 用于在表达式中剥离字符串的正则表达式
 * 用于在检查关键字之前移除字符串字面量，以避免误报
 */
const stripStringRE =
  /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g

/**
 * 验证非前缀表达式
 * 仅在使用浏览器运行时编译器时调用，因为它不对表达式添加前缀
 * @param node 简单表达式节点
 * @param context 转换上下文
 * @param asParams 是否作为参数验证
 * @param asRawStatements 是否作为原始语句验证
 * @returns 无返回值，如果表达式无效则会触发错误
 */
export function validateBrowserExpression(
  node: SimpleExpressionNode,
  context: TransformContext,
  asParams = false,
  asRawStatements = false,
): void {
  const exp = node.content

  // 空表达式由每个指令单独验证，因为某些指令允许空表达式
  if (!exp.trim()) {
    return
  }

  try {
    // 尝试创建一个函数来验证表达式的语法
    new Function(
      asRawStatements
        ? ` ${exp} `
        : `return ${asParams ? `(${exp}) => {}` : `(${exp})`}`,
    )
  } catch (e: any) {
    let message = e.message
    // 检查是否使用了禁止的关键字
    const keywordMatch = exp
      .replace(stripStringRE, '') // 先移除字符串字面量
      .match(prohibitedKeywordRE)
    if (keywordMatch) {
      message = `避免使用JavaScript关键字作为属性名: "${keywordMatch[0]}"`
    }
    // 触发编译错误
    context.onError(
      createCompilerError(
        ErrorCodes.X_INVALID_EXPRESSION,
        node.loc,
        undefined,
        message,
      ),
    )
  }
}
