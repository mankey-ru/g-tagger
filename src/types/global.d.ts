/// <reference types="node" />

type GetDataFromDiscogsResult = {
	genreStyle: string;
	discogsReleaseData: DiscogsReleaseData;
};

type ProcessAudioFileResult = {
	success: boolean;
	skipped?: boolean;
	skippedItem?: GtaggerSkippedItem;
	error?: string;
	genre?: string;
};

type GtaggerStats = {
	processed: number;
	skipped: number;
	skippedList: GtaggerSkippedItem[];
	failed: number;
};

type GtaggerSkippedItem = {
	skippedReason: string;
	filePath: string;
	allKindsOfNames: Record<string, string>;
	existingTags: any; // вообще, это ID3.Tags, но хер с ним
};

// Опции, полученные из командной строки
type GtaggerCliOptions = {
	/**  forceWriteTags - Писать теги, даже если они совпадают с текущими */
	force: boolean;
	/** includeSubdirectories - Обрабатывать также поддиректории */
	subdir: boolean;
};
