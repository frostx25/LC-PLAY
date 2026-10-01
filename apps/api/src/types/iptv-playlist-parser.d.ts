declare module "iptv-playlist-parser" {
  export interface PlaylistItem {
    name?: string;
    tvg?: {
      id?: string;
      name?: string;
      logo?: string;
      url?: string;
    };
    group?: { title?: string };
    url?: string;
  }

  export interface ParsedPlaylist {
    header?: { attrs?: Record<string, string> };
    items: PlaylistItem[];
  }

  const parser: {
    parse(value: string): ParsedPlaylist;
  };

  export default parser;
}
