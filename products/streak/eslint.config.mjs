import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['public/**', 'dist/**', 'node_modules/**', 'design/**'] },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['web/src/**/*.{ts,tsx}'],
  })),
  {
    files: ['web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/server', '**/src/store*', '**/src/auth', 'pg', 'node:*'],
              message: 'Browser features use public API adapters only.',
            },
          ],
        },
      ],
    },
  },
);
