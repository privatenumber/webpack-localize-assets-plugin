"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localizedStringKeyValidator = void 0;
const WebpackError_js_1 = __importDefault(require("webpack/lib/WebpackError.js"));
const has_own_prop_1 = __importDefault(require("has-own-prop"));
const webpack_1 = require("./webpack");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name } = require('../../package.json');
function localizedStringKeyValidator(locales, throwOnMissing) {
    const validatedLocales = new Set();
    return {
        assertValidLocaleString(stringKey, module, node) {
            if (validatedLocales.has(stringKey)) {
                return;
            }
            validatedLocales.add(stringKey);
            const keyMissingFromLocales = Object.keys(locales).filter(locale => !(0, has_own_prop_1.default)(locales[locale], stringKey));
            const isMissingFromLocales = keyMissingFromLocales.length > 0;
            if (!isMissingFromLocales) {
                return;
            }
            const location = node.loc.start;
            const error = new WebpackError_js_1.default(`[${name}] Missing localization for key "${stringKey}" used in ${module.resource}:${location.line}:${location.column} from locales: ${keyMissingFromLocales.join(', ')}`);
            if (error) {
                if (throwOnMissing) {
                    throw error;
                }
                else {
                    (0, webpack_1.reportModuleWarning)(module, error);
                }
            }
        },
    };
}
exports.localizedStringKeyValidator = localizedStringKeyValidator;
