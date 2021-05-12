import vm from 'vm';
import path from 'path';
import Module from 'module';

const isFilePath = /^[./]/;
const hasExtension = /\.\w+$/;

export interface FileSystem {
    readFileSync(
		path: string | Buffer | URL | number,
		options?: { encoding?: null; flag?: string } | null
	): Buffer;
}

export const createMemRequire = <T extends FileSystem>(mfs: T) => {
	function makeRequire(module) {
		function require(modulePath) {
			const pathExtension = modulePath.match(hasExtension)?.[0];
			if (isFilePath.test(modulePath) && !pathExtension) {
				modulePath += '.js';
			}

			const filename = path.resolve(path.dirname(module.filename), modulePath);
			const newModule = new Module(filename, module);
			newModule.filename = filename;

			const sourceCode = mfs.readFileSync(filename).toString();
			switch(pathExtension) {
				case '.js':
					const moduleWrappedSourceCode = Module.wrap(sourceCode);
					vm.runInNewContext(moduleWrappedSourceCode)(newModule.exports, makeRequire(newModule), newModule);
					break;

				case '.json':
					newModule.exports = JSON.parse(sourceCode);
					break;
			}

			return newModule.exports;
		}

		return require;
	}

	return makeRequire(module);
};
