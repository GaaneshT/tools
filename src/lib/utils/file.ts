export const getFileStem = (fileName: string): string => {
	return fileName.replace(/\.[^./]+$/, '');
};

export const deriveFileName = ({
	originalName,
	targetExtension,
	suffix
}: {
	originalName: string;
	targetExtension: string;
	suffix?: string;
}): string => {
	const stem =
		getFileStem(originalName)
			.replace(/[^a-z0-9-_]/gi, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'processed-file';
	return `${stem}${suffix ? `-${suffix}` : ''}.${targetExtension}`;
};
