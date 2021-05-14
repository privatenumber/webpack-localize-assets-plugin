# webpack-localize-assets-plugin <a href="https://npm.im/webpack-localize-assets-plugin"><img src="https://badgen.net/npm/v/webpack-localize-assets-plugin"></a> <a href="https://npm.im/webpack-localize-assets-plugin"><img src="https://badgen.net/npm/dm/webpack-localize-assets-plugin"></a> <a href="https://packagephobia.now.sh/result?p=webpack-localize-assets-plugin"><img src="https://packagephobia.now.sh/badge?p=webpack-localize-assets-plugin"></a>

Localize your Webpack bundle with multiple locales.

### Features
- Create bundles with localization baked in
- Suports single & multiple locales
- Blazing fast!

_How does it compare to [i18n-webpack-plugin](https://github.com/webpack-contrib/i18n-webpack-plugin)?_ Answered in the [FAQ](#how-does-this-compare-to-a-href-https-github-com-webpack-contrib-i18n-webpack-plugin-i18n-webpack-plugin-a-).

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## 🚀 Install
```sh
npm i -D webpack-localize-assets-plugin
```

## 🚦 Quick Setup

- Import `webpack-localize-assets-plugin`.
- Include `[locale]` in `output.filename` to indicate where the locale name should go in the output file.
- Register `webpack-localize-assets-plugin` with `locales` passed in.

In `webpack.config.js`:

```diff
+ const LocalizeAssetsPlugin = require('webpack-localize-assets-plugin')

  const locales = {
    en: { ... },
    es: { ... },
    ja: { ... },
    ...
  }

  module.exports = {
    ...,

   output: {
+     filename: '[name].[locale].js',
      ...
   },

    plugins: [
      ...,
+     new LocalizeAssetsPlugin({
+       locales
+     })
    ]
  }
```


## ⚙️ Options
#### locales
Required

Type:
```ts
{
  [locale: string]: {
    [stringKey: string]: string;
  };
}
```

An object containing all the localization strings. The key should be the locale name, and the value should be an object mapping the string key to the localized string.

Example:
```json5
{
  en: {
    helloWorld: 'Hello World!',
    goodbyeWorld: 'Goodbye World!',
    ...
  },
  es: {
    helloWorld: '¡Hola Mundo!',
    goodbyeWorld: '¡Adiós Mundo!',
    ...
  },
  ...
}
```

#### functionName
Type: `string`

Default: `__`

The function name to use to detect localization string keys.

```js
const message = __('helloWorld'); // => 'Hello world!'
```
#### throwOnMissing
Type: `boolean`

Default: `false`

Throw an error if a string key is not found in a locale object.

#### sourceMapsForLocales
Type: `string[]`

An array of locales that source-maps should be emitted for. Source-maps are enabled via [`devtool`](https://webpack.js.org/configuration/devtool/).

#### warnOnUnusedString
Type: `boolean`

Default: `false`

Enable to see warnings when unused string keys are found.

## 💁‍♀️ FAQ

### How does this compare to [i18n-webpack-plugin](https://github.com/webpack-contrib/i18n-webpack-plugin)?

_First of all, thank you to i18n-webpack-plugin for the original idea and implementation and serving the community._

`webpack-localize-assets-plugin` vs `i18n-webpack-plugin`:
- **Is actively maintained** `webpack-localize-assets-plugin` is actively maintained. `i18n-webpack-plugin` is no longer developed/maintained and has been archived with no official alternative.
- **Has Wepback 5 support** `webpack-localize-assets-plugin` supports Webpack 4 and 5. `i18n-webpack-plugin` only supports up to Webpack 4
- **Is optimized for multiple locales** `webpack-localize-assets-plugin` is designed to support multiple locales efficiently (and it's blazing fast!). `i18n-webpack-plugin` only supports one locale so building with multiple locales requires complete re-builds for each one.
