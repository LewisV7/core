/**
 * Vue单文件组件CSS空白清理插件
 * 该插件用于规范化Vue SFC中CSS规则前后的空白字符，确保一致的格式化
 */
import type { PluginCreator } from 'postcss'

/**
 * 创建Vue SFC空白清理插件
 * @returns {object} PostCSS插件对象
 */
const trimPlugin: PluginCreator<{}> = () => {
  return {
    postcssPlugin: 'vue-sfc-trim',
/**
     * PostCSS插件的Once钩子函数，在处理CSS时执行一次
     * @param {object} root - PostCSS的根节点对象
     */
    Once(root) {
      root.walk(({ type, raws }) => {
        if (type === 'rule' || type === 'atrule') {
          if (raws.before) raws.before = '\n'
          if ('after' in raws && raws.after) raws.after = '\n'
        }
      })
    },
  }
}

/**
 * 标识这是一个PostCSS插件
 * 用于PostCSS识别和加载该插件
 */
trimPlugin.postcss = true
export default trimPlugin
