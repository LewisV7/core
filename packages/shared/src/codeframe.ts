/**
 * 代码框架中显示错误位置周围的行数
 * 用于在生成代码框架时，控制显示错误行前后的代码行数
 */
const range: number = 2

/**
 * 生成代码框架，突出显示指定范围内的代码
 * @param source 源代码字符串
 * @param start 起始位置（包含），默认为0
 * @param end 结束位置（包含），默认为源代码长度
 * @returns 包含高亮代码范围的字符串
 */
export function generateCodeFrame(
  source: string,
  start = 0,
  end: number = source.length,
): string {
  // 确保起始和结束位置在源代码长度范围内
  start = Math.max(0, Math.min(start, source.length))
  end = Math.max(0, Math.min(end, source.length))

  if (start > end) return ''

  // 将内容分割成行，同时捕获分隔每行的换行符序列
  // 这很重要，因为需要实际的序列来正确考虑偏移比较的全行长度
  let lines = source.split(/(\r?\n)/)

  // 将行和换行符序列分离到单独的数组中，以便于引用
  const newlineSequences = lines.filter((_, idx) => idx % 2 === 1)
  lines = lines.filter((_, idx) => idx % 2 === 0)
  let count = 0
  // 用于跟踪当前处理的字符位置
  const res: string[] = []
  for (let i = 0; i < lines.length; i++) {
    count +=
      lines[i].length +
      ((newlineSequences[i] && newlineSequences[i].length) || 0)
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        // 跳过超出范围的行
        const line = j + 1
        res.push(
          `${line}${' '.repeat(Math.max(3 - String(line).length, 0))}|  ${
            lines[j]
          }`,
        )
        const lineLength = lines[j].length
        const newLineSeqLength =
          (newlineSequences[j] && newlineSequences[j].length) || 0
        if (j === i) {
          // 如果是包含起始位置的行，添加下划线标记错误位置
          // push underline
          const pad = start - (count - (lineLength + newLineSeqLength))
          const length = Math.max(
            1,
            end > count ? lineLength - pad : end - start,
          )
          res.push(`   |  ` + ' '.repeat(pad) + '^'.repeat(length))
        } else if (j > i) {
          // 如果是起始位置之后的行
          if (end > count) {
            const length = Math.max(Math.min(end - count, lineLength), 1)
            res.push(`   |  ` + '^'.repeat(length))
          }

          count += lineLength + newLineSeqLength
        }
      }
      break
    }
  }
  return res.join('\n')
}
