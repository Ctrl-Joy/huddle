// Mention syntax stored in message content (the composer converts "@name" picks into these tokens):
//   <@USER_ID>   user mention
//   <@&ROLE_ID>  role mention
//   <#CHANNEL_ID> channel mention
//   @everyone / @here

export const USER_MENTION_RE = /<@(\d+)>/g;
export const ROLE_MENTION_RE = /<@&(\d+)>/g;
export const CHANNEL_MENTION_RE = /<#(\d+)>/g;
export const EVERYONE_RE = /@(everyone|here)\b/;

export interface ParsedMentions {
  users: string[];
  roles: string[];
  channels: string[];
  everyone: boolean;
}

export function parseMentions(content: string): ParsedMentions {
  const uniq = (re: RegExp) => [...new Set([...content.matchAll(re)].map((m) => m[1]))];
  return {
    users: uniq(USER_MENTION_RE),
    roles: uniq(ROLE_MENTION_RE),
    channels: uniq(CHANNEL_MENTION_RE),
    everyone: EVERYONE_RE.test(content),
  };
}
