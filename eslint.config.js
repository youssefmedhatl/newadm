import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The project documents strict conventions in docs/BUILD_SPEC.md but had no
 * linter to enforce any of them, which is how a hook-after-early-return landed
 * in OrderDetailPage and blanked the page in production.
 *
 * Kept deliberately narrow: correctness rules that catch real crashes, not
 * style opinions that would bury them in noise.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/lib/database.types.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Hook order bugs are crashes, not warnings.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Unused vars are noise, but unused *args* are a normal callback pattern.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase deliberately avoids `any`; keep it that way.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
)
