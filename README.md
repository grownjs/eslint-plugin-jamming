# eslint-plugin-fruition

An ESLint plugin to preprocess fruition files before actual linting.

## Features

- Enable the `await` keyword on `$:` labels
- Inject exported symbols on consecutive blocks

## Requirements

- ESLint 6+

## Installation

Install the plugin:

```
npm install --save-dev eslint-plugin-fruition
```

Then add `fruition` to the `plugins` array in your `.eslintrc.*` config file.

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
  plugins: ['fruition'],
  rules: {
    // ...
  },
  settings: {
    // ...
  }
};
```

> This plugin performs some transformations using regular expressions on `.html` files before applying `eslint-plugin-html`.
