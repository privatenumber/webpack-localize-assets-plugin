"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const WebpackError_js_1 = __importDefault(require("webpack/lib/WebpackError.js"));
const types_1 = require("./types");
const load_locales_1 = require("./utils/load-locales");
const localize_filename_1 = require("./utils/localize-filename");
const track_unused_localized_strings_1 = require("./utils/track-unused-localized-strings");
const webpack_1 = require("./utils/webpack");
const localized_string_key_validator_1 = require("./utils/localized-string-key-validator");
const multi_locale_1 = require("./multi-locale");
const call_localize_compiler_1 = require("./utils/call-localize-compiler");
const stringify_ast_1 = require("./utils/stringify-ast");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../package.json');
const defaultLocalizerName = '__';
class LocalizeAssetsPlugin {
    constructor(options) {
        var _a;
        this.locales = {};
        this.fileDependencies = new Set();
        (0, types_1.validateOptions)(options);
        this.options = options;
        this.localeNames = Object.keys(options.locales);
        if (this.localeNames.length === 1) {
            [this.singleLocale] = this.localeNames;
        }
        this.localizeCompiler = (this.options.localizeCompiler
            ? this.options.localizeCompiler
            : {
                [(_a = this.options.functionName) !== null && _a !== void 0 ? _a : defaultLocalizerName]: defaultLocalizeCompilerFunction,
            });
        this.functionNames = Object.keys(this.localizeCompiler);
    }
    apply(compiler) {
        const { inputFileSystem } = compiler;
        compiler.hooks.thisCompilation.tap(name, (compilation, { normalModuleFactory }) => {
            // Reload on build
            const { fileDependencies, locales } = (0, load_locales_1.loadLocales)(inputFileSystem, this.options.locales);
            this.fileDependencies = fileDependencies;
            this.locales = locales;
            this.interceptTranslationFunctionCalls(normalModuleFactory);
            if (this.options.warnOnUnusedString) {
                const unusedStringKeys = (0, track_unused_localized_strings_1.getAllLocalizedStringKeys)(locales);
                /**
                 * Using something like compiler.done happens
                 * too late after the stats are reported in watch mode
                 */
                compilation.hooks.afterSeal.tap(name, () => (0, track_unused_localized_strings_1.warnOnUnusedLocalizedStringKeys)(unusedStringKeys, compilation));
                this.trackStringKeys = unusedStringKeys;
            }
            if (this.singleLocale) {
                (0, localize_filename_1.interpolateLocaleToFileName)(compilation, this.singleLocale);
            }
            else {
                /**
                 * The reason why we replace "[locale]" with a placeholder instead of
                 * the actual locale is because the name is used to load chunks.
                 *
                 * That means a file can be loading another file like `load('./file.[locale].js')`.
                 * We later localize the assets by search-and-replacing instances of
                 * `[locale]` with the actual locale.
                 *
                 * The placeholder is a unique enough string to guarantee that we're not accidentally
                 * replacing `[locale]` if it happens to be in the source JS.
                 */
                (0, localize_filename_1.interpolateLocaleToFileName)(compilation, multi_locale_1.fileNameTemplatePlaceholder, true);
                // Create localized assets by swapping out placeholders with localized strings
                (0, multi_locale_1.generateLocalizedAssets)(compilation, this.localeNames, this.locales, this.options.sourceMapForLocales || this.localeNames, this.trackStringKeys, this.localizeCompiler);
                // Update chunkHash based on localized content
                compilation.hooks.chunkHash.tap(name, (chunk, hash) => {
                    const modules = compilation.chunkGraph // WP5
                        ? compilation.chunkGraph.getChunkModules(chunk)
                        : chunk.getModules();
                    const localizedModules = modules
                        .map(module => module.buildInfo.localized)
                        .filter(Boolean);
                    if (localizedModules.length > 0) {
                        hash.update(JSON.stringify(localizedModules));
                    }
                });
            }
        });
    }
    interceptTranslationFunctionCalls(normalModuleFactory) {
        const { locales, singleLocale, functionNames } = this;
        const validator = (0, localized_string_key_validator_1.localizedStringKeyValidator)(locales, this.options.throwOnMissing);
        const handler = (parser, callExpressionNode, functionName) => {
            const { module } = parser.state;
            const firstArgumentNode = callExpressionNode.arguments[0];
            // Enforce minimum requirement that first argument is a string
            if (!(callExpressionNode.arguments.length > 0
                && firstArgumentNode.type === 'Literal'
                && typeof firstArgumentNode.value === 'string')) {
                const location = callExpressionNode.loc.start;
                (0, webpack_1.reportModuleWarning)(module, new WebpackError_js_1.default(`[${name}] Ignoring confusing usage of localization function "${functionName}" in ${module.resource}:${location.line}:${location.column}`));
                return;
            }
            const stringKey = firstArgumentNode.value;
            validator.assertValidLocaleString(stringKey, module, callExpressionNode);
            for (const fileDependency of this.fileDependencies) {
                module.buildInfo.fileDependencies.add(fileDependency);
            }
            const replacement = (singleLocale
                ? this.getLocalizedString(callExpressionNode, stringKey, module, singleLocale)
                : this.getMarkedFunctionPlaceholder(callExpressionNode, stringKey, module));
            (0, webpack_1.toConstantDependency)(parser, replacement)(callExpressionNode);
            return true;
        };
        for (const functionName of functionNames) {
            (0, webpack_1.onFunctionCall)(normalModuleFactory, functionName, (parser, node) => handler(parser, node, functionName));
        }
    }
    /**
     * For Single locale
     *
     * Insert the localized string during Webpack JS parsing.
     * No need to use placeholder for string replacement on asset.
     */
    getLocalizedString(callNode, key, module, singleLocale) {
        var _a;
        (_a = this.trackStringKeys) === null || _a === void 0 ? void 0 : _a.delete(key);
        return (0, call_localize_compiler_1.callLocalizeCompiler)(this.localizeCompiler, {
            callNode,
            resolveKey: (stringKey = key) => this.locales[singleLocale][stringKey],
            emitWarning: message => (0, webpack_1.reportModuleWarning)(module, new WebpackError_js_1.default(message)),
            emitError: message => (0, webpack_1.reportModuleError)(module, new WebpackError_js_1.default(message)),
        }, singleLocale);
    }
    /**
     * For Multiple locales
     *
     * 1. Replace the `__(...)` call with a placeholder -> `asdf(__(...)) + asdf`
     * 2. After the asset is generated & minified, search and replace the
     * placeholder with calls to localizeCompiler
     * 3. Repeat for each locale
     */
    getMarkedFunctionPlaceholder(callNode, key, module) {
        // Track used keys for hash
        if (!module.buildInfo.localized) {
            module.buildInfo.localized = {};
        }
        if (!module.buildInfo.localized[key]) {
            module.buildInfo.localized[key] = this.localeNames.map(locale => this.locales[locale][key]);
        }
        return (0, multi_locale_1.markLocalizeFunction)(callNode);
    }
}
LocalizeAssetsPlugin.defaultLocalizeCompiler = {
    [defaultLocalizerName]: defaultLocalizeCompilerFunction,
};
function defaultLocalizeCompilerFunction(localizerArguments) {
    const [key] = localizerArguments;
    if (localizerArguments.length > 1) {
        let code = (0, stringify_ast_1.stringifyAst)(this.callNode);
        if (code.length > 80) {
            code = `${code.slice(0, 80)}…`;
        }
        this.emitWarning(`[${name}] Ignoring confusing usage of localization function: ${code})`);
        return key;
    }
    const keyResolved = this.resolveKey();
    return keyResolved ? JSON.stringify(keyResolved) : key;
}
module.exports = LocalizeAssetsPlugin;
