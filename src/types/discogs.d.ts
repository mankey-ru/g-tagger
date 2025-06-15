interface DiscogsReleaseData {
	id: number;
	status: string;
	year: number;
	resource_url: string;
	uri: string;
	artists: DiscogsArtist[];
	artists_sort: string;
	labels: DiscogsLabel[];
	series: any[]; // Replace with proper type if known
	companies: any[]; // Replace with proper type if known
	formats: DiscogsFormat[];
	data_quality: string;
	community: DiscogsCommunity;
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
	identifiers: DiscogsIdentifier[];
	videos: DiscogsVideo[];
	genres: string[];
	styles: string[];
	tracklist: DiscogsTrack[];
	extraartists: DiscogsArtist[];
	images: DiscogsImage[];
	thumb: string;
	estimated_weight: number;
	blocked_from_sale: boolean;
	is_offensive: boolean;
}

interface DiscogsArtist {
	name: string;
	anv: string;
	join: string;
	role: string;
	tracks: string;
	id: number;
	resource_url: string;
	thumbnail_url?: string;
}

interface DiscogsLabel {
	name: string;
	catno: string;
	entity_type: string;
	entity_type_name: string;
	id: number;
	resource_url: string;
	thumbnail_url: string;
}

interface DiscogsFormat {
	name: string;
	qty: string;
	descriptions: string[];
	text: string;
}

interface DiscogsCommunityRating {
	count: number;
	average: number;
}

interface DiscogsSubmitter {
	username: string;
	resource_url: string;
}

interface DiscogsContributor {
	username: string;
	resource_url: string;
}

interface DiscogsCommunity {
	have: number;
	want: number;
	rating: DiscogsCommunityRating;
	submitter: DiscogsSubmitter;
	contributors: DiscogsContributor[];
	data_quality: string;
	status: string;
}

interface DiscogsIdentifier {
	type: string;
	value: string;
}

interface DiscogsVideo {
	uri: string;
	title: string;
	description: string;
	duration: number;
	embed: boolean;
}

interface DiscogsTrack {
	position: string;
	type_: string;
	title: string;
	duration: string;
}

interface DiscogsImage {
	type: string;
	uri: string;
	resource_url: string;
	uri150: string;
	width: number;
	height: number;
}
