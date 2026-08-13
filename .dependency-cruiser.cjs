/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-stays-framework-free',
      comment: 'Domain contracts must not depend on React Native or outer implementation layers.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: {
        path: '^(app|src/(app|data|features|native|observability|stores|sync|testing))|^(react|expo|@shopify)',
      },
    },
    {
      name: 'routes-use-feature-boundaries',
      comment:
        'Routes may compose screens but cannot call data, native, or sync implementations directly.',
      severity: 'error',
      from: { path: '^app' },
      to: { path: '^src/(data|native|sync)' },
    },
    {
      name: 'ui-does-not-own-storage-or-crypto',
      comment: 'UI components consume use cases, never SQLite or cryptography implementations.',
      severity: 'error',
      from: { path: '^src/(design|features/.*/components|features/.*/screens)' },
      to: { path: '^(expo-sqlite|src/native/crypto|modules/m2y-crypto)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|android|ios|dist|\.expo)(/|$)' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
