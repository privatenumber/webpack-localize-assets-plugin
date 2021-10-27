declare module 'webpack/lib/WebpackError.js' {
	class WebpackError extends Error {
		constructor (message?: string);

		details: any;

		module: any; // Module;

		loc: any; // DependencyLocation;

		hideStack: boolean;

		chunk: any; // Chunk;

		file: string;

		serialize(__0: { write: any }): void;

		deserialize(__0: { read: any }): void;
	}
	export default WebpackError;
}
