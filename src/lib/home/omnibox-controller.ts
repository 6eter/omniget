export type OmniState =
  | { kind: "idle" }
  | { kind: "detecting" }
  | { kind: "detected"; info: PlatformInfo }
  | { kind: "unsupported" }
  | { kind: "preparing"; platform: string }
  | { kind: "batch"; urls: string[] }
  | { kind: "searching" }
  | { kind: "search-results"; results: SearchResult[] }
  | { kind: "search-empty" }
  | { kind: "error"; message: string; originalUrl: string; platform: string };

export type PlatformInfo = {
  platform: string;
  supported: boolean;
  content_id: string | null;
  content_type: string | null;
};

export type SearchResult = {
  id: string;
  title: string;
  author: string;
  duration: number | null;
  thumbnail_url: string | null;
  url: string;
  platform: string;
};

export type HomeInputMode = "url" | "batch" | "torrent" | "p2p";

export type MoreAction = "batch" | "torrent" | "p2p" | "advanced";

export type HomeArt = "idle" | "analyzing" | "success" | "error" | "unsupported" | "drop";

export function isUrl(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("magnet:") ||
    value.startsWith("p2p:") ||
    value.endsWith(".torrent")
  );
}
