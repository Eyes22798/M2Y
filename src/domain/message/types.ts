export const messageAuthors = ['self', 'other'] as const;

export type MessageAuthor = (typeof messageAuthors)[number];

export type Message = Readonly<{
  id: string;
  author: MessageAuthor;
  body: string;
  createdAtMs: number;
  savedItemIds: readonly string[];
}>;
