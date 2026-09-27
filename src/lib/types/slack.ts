/** A workspace's Slack install, as the API returns it. The bot token never crosses the wire. */
export interface SlackConnection {
  id: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  grantedScopes: string[];
  /** The channel the workspace posts to; null until someone picks one. */
  channelId: string | null;
  channelName: string | null;
  /** Hashtags (lowercase, no `#`) that mark a message in the channel for capture. */
  captureTags: string[];
  connectedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  /** Whether the bot is already in the channel. Public channels get joined on selection. */
  isMember: boolean;
}
