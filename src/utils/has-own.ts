const { hasOwnProperty } = Object.prototype;

export const hasOwn = (
	object: object,
	property: PropertyKey,
) => hasOwnProperty.call(object, property);
