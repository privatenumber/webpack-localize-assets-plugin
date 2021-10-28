export const encode = (
	ascii: string,
) => Buffer.from(ascii).toString('base64');

export const decode = (
	base64Encoded: string,
) => Buffer.from(base64Encoded, 'base64').toString('ascii');
