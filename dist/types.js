"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOptions = void 0;
const has_own_prop_1 = __importDefault(require("has-own-prop"));
function validateOptions(options) {
    if (!options) {
        throw new Error('Options are required');
    }
    if (!options.locales) {
        throw new Error('Locales are required');
    }
    if (Object.keys(options.locales).length === 0) {
        throw new Error('locales must contain at least one locale');
    }
    if (options.sourceMapForLocales
        && options.sourceMapForLocales.some(locale => !(0, has_own_prop_1.default)(options.locales, locale))) {
        throw new Error('sourceMapForLocales must contain valid locales');
    }
    if (options.localizeCompiler) {
        if (Object.keys(options.localizeCompiler).length === 0) {
            throw new Error('localizeCompiler can\'t be an empty object');
        }
        if (options.functionName) {
            throw new Error('Can\'t use localizeCompiler and also specify functionName');
        }
    }
}
exports.validateOptions = validateOptions;
