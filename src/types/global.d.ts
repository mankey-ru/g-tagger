/// <reference types="node" />

type GetDataFromDiscogsResult = {
	genreStyle: string;
	discogsReleaseData: DiscogsReleaseData;
	taggerStage: string;
};

type ProcessAudioFileResult = {
	isWroteTags: boolean;
	/** Discogs data found, but tags already match, so the file was not rewritten */
	isTagsUnchanged?: boolean;
	isSkipped?: boolean;
	skippedItem?: GtaggerSkippedItem;
	error?: string;
	genre?: string;
};

type GtaggerStats = {
	qtyWrittenTags: number;
	qtyUnchangedTags: number;
	qtySkipped: number;
	skippedList: GtaggerSkippedItem[];
	failed: number;
};

/** JSON value of the TXXX:GTAGGER frame */
type GtaggerMarker = {
	/** app version without "v" prefix */
	version: string;
	/** search stage at which Discogs data was found, e.g. "2.1" */
	stage: string;
	/** ISO timestamp of processing */
	date: string;
};

type UserDefinedTextFrame = {
	description: string;
	value: string;
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
	/** количество миллисекунд между запросами */
	request_delay: string;
};
