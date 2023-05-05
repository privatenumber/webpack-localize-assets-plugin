# To install this fork:

```
npm i -S 'ShoryuKyzan/webpack-localize-assets-plugin#npm/shoryukyzan/hot-module-reload'
```
This is based on version 1.5.4 of the upstream.

# webpack-localize-assets-plugin <a href="https://npm.im/webpack-localize-assets-plugin"><img src="https://badgen.net/npm/v/webpack-localize-assets-plugin"></a> <a href="https://npm.im/webpack-localize-assets-plugin"><img src="https://badgen.net/npm/dm/webpack-localize-assets-plugin"></a> <a href="https://packagephobia.now.sh/result?p=webpack-localize-assets-plugin"><img src="https://packagephobia.now.sh/badge?p=webpack-localize-assets-plugin"></a>

Localize your Webpack bundle with multiple locales.

### Features
- Create bundles with localization baked in
- Suports single & multiple locales
- Blazing fast!

_How does it compare to [i18n-webpack-plugin](https://github.com/webpack-contrib/i18n-webpack-plugin)?_ Answered in the [FAQ](#how-does-this-compare-to-i18n-webpack-plugin).

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## 🚀 Install
```sh
npm i -D webpack-localize-assets-plugin
```

## 🚦 Quick setup

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
+         filename: '[name].[locale].js',
          ...
      },

      plugins: [
          ...,
+         new LocalizeAssetsPlugin({
+             locales
+         })
      ]
  }
```


## ⚙️ Options
#### locales
Required

Type:
```ts
type Locales = {
    [locale: string]: string | {
        [stringKey: string]: string
    }
}
```

An object containing all the localization strings.

The key should be the locale name, and the value can either be _the path to the locale JSON file_ or _an object mapping the string key to the localized string_.

Using a JSON path has the advantage of automatically detecting changes across compilations, which is useful in development.

Example:
```js
new LocalizeAssetsPlugin({
    locales: {
        en: './locales/en.json',
        es: './locales/es.json'
        // ...
    }
    // ...
})
```

Or:

```js
new LocalizeAssetsPlugin({
    locales: {
        en: {
            helloWorld: 'Hello World!',
            goodbyeWorld: 'Goodbye World!'
            // ...
        },
        es: {
            helloWorld: '¡Hola Mundo!',
            goodbyeWorld: '¡Adiós Mundo!'
            // ...
        }
        // ...
    }
    // ...
})
```

#### functionName
Type: `string`

Default: `__`

The function name to use to detect localization string keys.

```js
const message = __('helloWorld') // => 'Hello world!'
```
#### throwOnMissing
Type: `boolean`

Default: `false`

Throw an error if a string key is not found in a locale object.

#### sourceMapForLocales
Type: `string[]`

An array of locales that source-maps should be emitted for. Source-maps are enabled via [`devtool`](https://webpack.js.org/configuration/devtool/).

#### warnOnUnusedString
Type: `boolean`

Default: `false`

Enable to see warnings when unused string keys are found.

### localizeCompiler
Type:
```ts
type LocalizeCompiler = {
    // localizer function name (eg. __)
    [functionName: string]: (
        this: LocalizeCompilerContext,
        localizerArguments: string[],
        localeName: string,
    ) => string
}
```

Default:
```ts
const localizeCompiler = {
    __(localizerArguments) {
        const [key] = localizerArguments
        const keyResolved = this.resolveKey()
        return keyResolved ? JSON.stringify(keyResolved) : key
    }
}
```

An object of functions to generate a JS string to replace the `__()` call with. The object key is the localize function name, and its function gets called for each localize function call (eg. `__(...)`) for each locale. This allows you to have multiple localization functions, with separate compilation logic for each of them.

Note, you cannot use both `functionName` and `localizeCompiler`. Simply set the function name as a key in the `localizeCompiler` object instead.

#### localizerArguments
An array of strings containing JavaScript expressions. The expressions are stringified arguments of the original call. So `localizerArguments[0]` will be a JavaScript expression containing the translation key.

#### localeName
The name of the current locale

#### `this` context

| Name | Type | Description |
| - | - | - |
| `resolveKey` | `(key?: string) => string` | A function to get the localized data given a key. Defaults to the key passed in. |
| `emitWarning` | `(message: string) => void` | Call this function to emit a warning into the Webpack build. |
| `emitError` | `(message: string) => void` | Call this function to emit an error into the Webpack build.  |
| `callNode` | [`CallExpression`](https://github.com/estree/estree/blob/master/es5.md#callexpression) | [AST](https://github.com/estree/estree) node representing the original call to the localization function (eg. `__()`). |

`localizeCompiler` must return a string containing a JavaScript expression. The expression will be injected into the bundle in the place of the original `__()` call. The expression should represent the localized string.

You can use `localizeCompiler` to do inject more localization logic (eg. pluralization).

## 💁‍♀️ FAQ

### How does this work and how is it so fast?
This plugin has two modes: _Single-locale_ and _Multi-locale_.

In _Single-locale mode_, it works just like [i18n-webpack-plugin](https://github.com/webpack-contrib/i18n-webpack-plugin). It replaces the localization calls with localized strings during Webpack's module parsing stage. Since there is only one locale, localization only needs to be done once at the earliest possible stage.

In _Multi-locale mode_, it inserts placeholders instead of the localized strings at the module parsing stage. After minification, all assets are duplicated for each locale and the placeholders are replaced with the localized strings via find-and-replace.

The speed gains come from:
- Applying localization to minified assets. By doing so, we can avoid re-minifying the assets for each locale.
- Using find-and-replace to localize. Find-and-replace is literally just looking for a pattern in a string and replacing it, so there is no AST parsing costs incurred for each locale.


### How does this compare to [i18n-webpack-plugin](https://github.com/webpack-contrib/i18n-webpack-plugin)?

_First of all, thank you to i18n-webpack-plugin for the original idea and implementation and serving the community._

`webpack-localize-assets-plugin` vs `i18n-webpack-plugin`:
- **Is actively maintained** `webpack-localize-assets-plugin` is actively maintained. `i18n-webpack-plugin` is no longer developed/maintained and has been archived with no official alternative.
- **Has Wepback 5 support** `webpack-localize-assets-plugin` supports Webpack 4 and 5. `i18n-webpack-plugin` only supports up to Webpack 4
- **Is optimized for multiple locales** `webpack-localize-assets-plugin` is designed to support multiple locales efficiently (and it's blazing fast!). `i18n-webpack-plugin` only supports one locale so building with multiple locales requires complete re-builds for each one.

### How does this approach compare to run-time localization?
There are two approaches to localization:
  - **Build-time localization** Happens during building/compiling. Localized strings are baked into the assets basically by find-and-replace. _This plugin is an example of build-time localization._
  - **Run-time localization** Happens when the application is running. An asset with localized strings is loaded and strings are referenced by unique key.

Here is a comparison:

<table>
  <thead>
    <tr>
      <th></th>
      <th>Run-time</th>
      <th>Build-time</th>
    </tr>
  </thead>
  <tbody>
    <tr valign="top">
      <th>Output size</th>
      <td>
        <strong>Small.</strong>
        <br>
        Application code is agnostic to locale so it only needs to be produced once. Locale data files are produced for each locale to be loaded by application at run-time.
      </td>
      <td>
        <strong>Large.</strong>
        <br>
        The entire build is multiplied for every locale. The impact of this multiplication increases with assets that don't require localization (eg. source maps, vendor chunks).
        <br><br>
        Comparing the size of one locale between build-time and run-time, build-time has a slight advantage because there is no "loading overhead" (requesting locale data, long reference keys, etc.). This difference is small but can be negligible after <a href="https://github.com/privatenumber/webpack-json-access-optimizer">good minification</a> & compression.
      </td>
    </tr>
    <tr valign="top">
      <th>Build time</th>
      <td>
        <strong>Fast.</strong>
        <br>
        It's a lot faster because the build only needs to be produced once. Each locale data needs to be produced but there's no processing cost.
      </td>
      <td>
        <strong>Slow.</strong>
        <br>
        Build speed gets slower with size; so with the build being multiplied for each locale, it's very slow. Although optimizations (like this plugin) can apply localization post-bundling to re-use bundles across multiple locales, it's still a lot slower because large assets take time to localize and write to disk.
        This gets much slower when enabling things like source maps. To improve speed, you might enable source maps only for the main locale at the cost of debugging experience in other locales.
      </td>
    </tr>
    <tr valign="top">
      <th>Loading time</th>
      <td>
        <strong>Fast.</strong>
        <br>
        Although initial page-load might need to request at least two assets instead of one (localization data and application), this can still be very fast with minification & compression. Even faster when using <a href="https://stackoverflow.com/a/59310436/911407">HTTP/2 multiplexing</a> and <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Link_types/preload">preloading</a>/<a href="https://javascript.info/script-async-defer">async</a>.
        <br><br>
        There's also a notable benefit of fast locale switching. When a user changes their locale, only the new locale asset needs to be loaded because the application code (the larger asset) is already loaded or will have a cache-hit.
      </td>
      <td>
        <strong>Fast.</strong>
        <br>
        Since localization is baked-in, there is no need to load an additional asset of just locale strings.
        <br><br>
        However, there is a large cost to when users switch locales as the entire app will need to be re-loaded and there will be no cache-hits if it's a new locale.
      </td>
    </tr>
  </tbody>
</table>
