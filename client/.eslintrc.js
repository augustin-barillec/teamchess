module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    '@vue/airbnb',
  ],
  rules: {
    "quotes": [2, "single", { "avoidEscape": true }],
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
    camelcase: ["off", { properties: "never" }],
    'max-len': ["error", { "code": 1200 }]
  },
};
