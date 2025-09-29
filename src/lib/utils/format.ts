const UNITS = ['B', 'KB', 'MB', 'GB'];

export const formatBytes = (input: number, fractionDigits = 1): string => {
	if (!Number.isFinite(input) || input < 0) {
		return '0 B';
	}

	let value = input;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < UNITS.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : fractionDigits)} ${UNITS[unitIndex]}`;
};

export const formatImageDimensions = (width: number, height: number): string =>
	`${Math.round(width)} × ${Math.round(height)}`;
