"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLocalizeCompiler = void 0;
const stringify_ast_1 = require("./stringify-ast");
function callLocalizeCompiler(localizeCompiler, context, localeName) {
    const callNodeArguments = context.callNode.arguments.map(stringify_ast_1.stringifyAst);
    const functionName = context.callNode.callee.name;
    return localizeCompiler[functionName].call(context, callNodeArguments, localeName);
}
exports.callLocalizeCompiler = callLocalizeCompiler;
