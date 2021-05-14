import fs from 'fs';
import path from 'path';
import webpack, { OutputFileSystem } from 'webpack';
import { ufs } from 'unionfs';
import { IFS } from 'unionfs/lib/fs.js';
import { Volume, DirectoryJSON } from 'memfs';
import AggregateError from 'aggregate-error';
import { FileSystem } from './memfs-require';

export function assertFsWithReadFileSync(
	mfs: webpack.InputFileSystem | webpack.OutputFileSystem,
): asserts mfs is webpack.OutputFileSystem & FileSystem {
	if (!('readFileSync' in mfs)) {
		throw new Error('Missing readFileSync');
	}
	if (!('writeFileSync' in mfs)) {
		throw new Error('Missing writeFileSync');
	}
}

const mfsFromJson = (volJson: DirectoryJSON): webpack.OutputFileSystem => {
	const mfs = Volume.fromJSON(volJson) as unknown as OutputFileSystem;
	mfs.join = path.join;
	return mfs;
};

function createCompiler(
	volJson: DirectoryJSON,
	configCallback: (config: webpack.Configuration) => void,
) {
	const mfs = mfsFromJson(volJson);
	const config: webpack.Configuration = {
		mode: 'production',
		target: 'node',
		entry: {
			index: '/src/index.js',
		},
		module: {
			rules: [],
		},
		optimization: {
			minimize: false,
		},
		output: {
			filename: '[name].[locale].js',
			path: '/dist',
			libraryTarget: 'commonjs2',
			libraryExport: 'default',
		},
		plugins: [],
	};

	if (configCallback) {
		configCallback(config);
	}

	const compiler = webpack(config);

	compiler.inputFileSystem = ufs.use(fs).use(mfs as unknown as IFS);
	compiler.outputFileSystem = mfs;

	return compiler;
}

export function build(
	volJson: DirectoryJSON,
	configCallback: (config: webpack.Configuration) => void,
) {
	return new Promise<webpack.Stats>((resolve, reject) => {
		const compiler = createCompiler(volJson, configCallback);

		compiler.run((error, stats) => {
			if (error) {
				reject(error);
				return;
			}

			if (stats.hasErrors()) {
				reject(new AggregateError(stats.compilation.errors));
				return;
			}

			resolve(stats);
		});
	});
}

type ChangeFunction = (fs: webpack.InputFileSystem, stats: webpack.Stats) => void | Promise<void>;

export function watch(
	volJson: DirectoryJSON,
	configCallback: (config: webpack.Configuration) => void,
	changes: ChangeFunction[],
) {
	return new Promise<webpack.Stats>((resolve, reject) => {
		const compiler = createCompiler(volJson, configCallback);
		const watching = compiler.watch({}, async (error, stats) => {
			if (error) {
				reject(error);
				return;
			}

			const callback = changes.shift();
			if (callback) {
				await callback(compiler.inputFileSystem, stats);
				watching.invalidate();
			} else {
				watching.close(() => resolve(stats));
			}
		});
	});
}
