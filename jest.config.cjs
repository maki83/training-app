module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/tests/**/*.test.js'],
      testPathIgnorePatterns: [
        '/node_modules/',
        // Ignore jsdom-specific frontend DOM tests in the node environment
        '/tests/frontend\\.dom\\.test\\.js$'
      ]
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/frontend.dom.test.js']
    }
  ]
};
