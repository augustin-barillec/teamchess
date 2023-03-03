module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    '@vue/airbnb',
  ],
  parserOptions: {
    parser: 'babel-eslint',
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    semi: [2, "always"],
    "comma-dangle": ["warn", "always-multiline"],
    "vue/no-mutating-props": "off",
    indent: ["error", 2, { SwitchCase: 1 }],
    "vue/v-on-event-hyphenation": "warn",
    "vue/multi-word-component-names": "warn",
    "no-sequences": "warn",
    "prefer-const": "warn",
    camelcase: ["warn", { properties: "never" }],
    "quotes": [2, "double", { "avoidEscape": true }]
  },
};
