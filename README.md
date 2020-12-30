# eslint-plugin-fruition

An ESLint plugin to preprocess fruition files before actual linting.

## Features

- Seamlessly rewrite `await` keyword on `$:` labels

## Requirements

- ESLint 6+

## Installation

Install both plugins:

```
npm install --save-dev eslint-plugin-fruition eslint-plugin-html
```

Then add `fruition` and `html` to the `plugins` array in your `.eslintrc.*` config file.

For example:

```javascript
module.exports = {
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module'
  },
  env: {
    es6: true
  },
  plugins: ['fruition', 'html'],
  rules: {
    // ...
  },
  settings: {
    // ...
  }
};
```

> This plugin performs some transformations using regular expressions on `.html` files only.
