import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/storybook-static/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
  {
    // enforce one property per line for object literals (disallow all props on same line)
    rules: {
      'object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],
      // enforce consistent indentation (2 spaces) so newlines get properly indented
      indent: ['error', 2, {
        SwitchCase: 1,
        VariableDeclarator: 1,
        outerIIFEBody: 1,
        MemberExpression: 1,
        FunctionDeclaration: { parameters: 'first' },
      }],
      // Vue template indentation
      'vue/html-indent': ['error', 2],
      // require line breaks inside object braces even for single-property objects
      'object-curly-newline': ['error', {
        ObjectExpression: { minProperties: 1 },
        ObjectPattern: { minProperties: 1 },
        ImportDeclaration: { minProperties: 999 },
        ExportDeclaration: { minProperties: 999 }
      }],
      // enforce no semicolons
      'semi': ['error', 'never'],
    },
  },
)
