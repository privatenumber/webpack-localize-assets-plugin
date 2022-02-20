"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.warnOnUnusedLocalizedStringKeys = exports.getAllLocalizedStringKeys = void 0;
const WebpackError_js_1 = __importDefault(require("webpack/lib/WebpackError.js"));
const has_own_prop_1 = __importDefault(require("has-own-prop"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');
function getAllLocalizedStringKeys(locales) {
    const allStringKeys = new Set();
    for (const localeName in locales) {
        if ((0, has_own_prop_1.default)(locales, localeName)) {
            for (const stringKey in locales[localeName]) {
                if ((0, has_own_prop_1.default)(locales[localeName], stringKey)) {
                    allStringKeys.add(stringKey);
                }
            }
        }
    }
    return allStringKeys;
}
exports.getAllLocalizedStringKeys = getAllLocalizedStringKeys;
const warnOnUnusedLocalizedStringKeys = (unusedStringKeys, compilation) => {
    if (unusedStringKeys.size > 0) {
        for (const unusedStringKey of unusedStringKeys) {
            const error = new WebpackError_js_1.default(`[${name}] Unused string key "${unusedStringKey}"`);
            compilation.warnings.push(error);
        }
    }
};
exports.warnOnUnusedLocalizedStringKeys = warnOnUnusedLocalizedStringKeys;
