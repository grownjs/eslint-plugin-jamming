# eslint-plugin-jamrock

An ESLint plugin to preprocess jamrock files before actual linting.

## Features

- Enable the `await` keyword on `$:` labels
- Share exported symbols from consecutive scripts
- Check for syntax errors inside template `{ ... }` blocks
- Enforce `no-unused-vars/no-undef` on template `{ ... }` blocks

## Requirements

- ESLint 6+

## Installation

Install the plugin:

```
npm install --save-dev eslint-plugin-jamrock
```

Then add `jamrock` to the `plugins` array in your `.eslintrc.*` config file.

For example:

```json
{
  "extends": [
    "plugin:jamrock/config"
  ]
}
```

> This plugin performs some transformations using regular expressions on `.html` files before applying `eslint-plugin-html`.
