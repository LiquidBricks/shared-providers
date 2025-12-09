export function createRouterState({ config, tokens, context }) {
  return {
    config,
    tokens,
    context,
    routes: [],
    middlewares: [],
    trie: {},
    hooks: {
      onError: null,
      onAbort: null,
      before: null,
      after: null,
      beforeEach: null,
      afterEach: null,
    }
  }
}
