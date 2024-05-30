import tseslint from 'typescript-eslint'
import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'

// export default [
//   {
//     languageOptions: {
//       parser: tsParser,
//     },
//     plugins: {
//       '@typescript-eslint': tseslint,
//     },
//     parserOptions: {
//       ecmaVersion: 2020,
//       sourceType: 'module',
//     },
//     env: {
//       browser: true,
//       es2017: true,
//       node: false,
//     },
//     ignorePatterns: [
//       '.DS_Store',
//       'node_modules/',
//       'dist/',
//       '.env',
//       '.env.*',
//       '!.env.example',
//       'pnpm-lock.yaml',
//       'yarn.lock',
//       'package-lock.json',
//     ],
//   },
// ]

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    ignores: [
      '.DS_Store',
      'node_modules/',
      'dist/',
      '.env',
      '.env.*',
      '!.env.example',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        ecmaVersion: 2017,
      },
      ecmaVersion: 2017,
      sourceType: 'module',
    },
  }
)
