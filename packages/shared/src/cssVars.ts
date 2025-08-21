/**
 * 标准化由 `<style>` 块中的 `v-bind` 创建的 CSS 变量值
 * 详情请参阅 https://github.com/vuejs/core/pull/12461#issuecomment-2495804664
 */
export function normalizeCssVarValue(value: unknown): string {
  if (value == null) {
    return 'initial'
  }

  if (typeof value === 'string') {
    return value === '' ? ' ' : value
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (__DEV__) {
      console.warn(
        '[Vue warn] Invalid value used for CSS binding. Expected a string or a finite number but received:',
        value,
      )
    }
  }

  return String(value)
}
