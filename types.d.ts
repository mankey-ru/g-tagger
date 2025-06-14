interface Artist {
	name: string;
	anv: string;
	join: string;
	role: string;
	tracks: string;
	id: number;
	resource_url: string;
	thumbnail_url?: string;
}

interface Label {
	name: string;
	catno: string;
	entity_type: string;
	entity_type_name: string;
	id: number;
	resource_url: string;
	thumbnail_url: string;
}

interface Format {
	name: string;
	qty: string;
	descriptions: string[];
	text: string;
}

interface CommunityRating {
	count: number;
	average: number;
}

interface Submitter {
	username: string;
	resource_url: string;
}

interface Contributor {
	username: string;
	resource_url: string;
}

interface Community {
	have: number;
	want: number;
	rating: CommunityRating;
	submitter: Submitter;
	contributors: Contributor[];
	data_quality: string;
	status: string;
}

interface Identifier {
	type: string;
	value: string;
}

interface Video {
	uri: string;
	title: string;
	description: string;
	duration: number;
	embed: boolean;
}

interface Track {
	position: string;
	type_: string;
	title: string;
	duration: string;
}

interface Image {
	type: string;
	uri: string;
	resource_url: string;
	uri150: string;
	width: number;
	height: number;
}

interface DiscogsReleaseData {
	id: number;
	status: string;
	year: number;
	resource_url: string;
	uri: string;
	artists: Artist[];
	artists_sort: string;
	labels: Label[];
	series: any[]; // Replace with proper type if known
	companies: any[]; // Replace with proper type if known
	formats: Format[];
	data_quality: string;
	community: Community;
	format_quantity: number;
	date_added: string;
	date_changed: string;
	num_for_sale: number;
	lowest_price: number;
	master_id: number;
	master_url: string;
	title: string;
	country: string;
	released: string;
	notes: string;
	released_formatted: string;
	identifiers: Identifier[];
	videos: Video[];
	genres: string[];
	styles: string[];
	tracklist: Track[];
	extraartists: Artist[];
	images: Image[];
	thumb: string;
	estimated_weight: number;
	blocked_from_sale: boolean;
	is_offensive: boolean;
}

interface GetDataFromDiscogsResult {
	genreStyle: string;
	discogsReleaseData: DiscogsReleaseData;
}
