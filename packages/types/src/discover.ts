import type { BoardCard } from './board';
import type { PublicProfile } from './identity';
import type { PostCard } from './post';

export type RankingWeights = {
  peopleIInteractWith: number;
  newCreators: number;
  nearby: number;
  lessVideo: number;
};

export type RankingSignal = {
  key: 'topic' | 'interact' | 'new_creator' | 'nearby' | 'popularity' | 'recency' | 'video';
  label: string;
  weight: number;
  value: number;
  contribution: number;
};

export type PlacePreview = {
  id: string;
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
};

export type PlacePage = PlacePreview & {
  postCount: number;
  sort: 'top' | 'recent';
  items: PostCard[];
  nextCursor: string | null;
};

export type HashtagPage = {
  tag: string;
  postCount: number;
  followed: boolean;
  sort: 'top' | 'recent';
  items: PostCard[];
  nextCursor: string | null;
};

export type DiscoverItem = {
  impressionId: string;
  score: number;
  signals: RankingSignal[];
  post: PostCard;
};

export type DiscoverTopic = {
  tag: string;
  label: string;
  postCount: number;
  followed: boolean;
};

export type DiscoverFeed = {
  items: DiscoverItem[];
  nextCursor: string | null;
  topic: string | null;
  topics: DiscoverTopic[];
  weights: RankingWeights;
  engine: 'rules';
};

export type SearchEngine = 'meilisearch' | 'postgres';

export type SearchHashtagHit = {
  tag: string;
  postCount: number;
  followed: boolean;
};

export type SearchPlaceHit = PlacePreview & {
  postCount: number;
};

export type SearchCaptionHit = {
  post: PostCard;
};

export type SearchResults = {
  query: string;
  engine: SearchEngine;
  people: PublicProfile[];
  hashtags: SearchHashtagHit[];
  places: SearchPlaceHit[];
  captions: SearchCaptionHit[];
  boards: BoardCard[];
};

export type BoardSearchPage = {
  query: string;
  engine: SearchEngine;
  items: BoardCard[];
  nextCursor: string | null;
};

export type RecentSearchView = {
  query: string;
  createdAt: string;
};

export type MemoryMapPin = {
  postId: string;
  place: PlacePreview;
  publishedAt: string;
  thumbnailUrl: string | null;
  caption: string;
};

export type MemoryMapView = {
  handle: string;
  enabled: boolean;
  visible: boolean;
  pins: MemoryMapPin[];
};

export type SuggestedPerson = {
  profile: PublicProfile;
  reason: string;
};
