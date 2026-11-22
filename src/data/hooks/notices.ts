// Avisos (SPEC 22, wiki #214): the person's notices, the bell's live count and marking read.
// Only while signed in: a guest makes no request (no 401 on sign-out, as seen in T21).
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Notice, NoticePage } from '../types';
import { useSession } from './session';

/** When the live channel is not connected, the bell asks again every 60 s. */
const UNREAD_FALLBACK_MS = 60_000;

function useSignedIn(): boolean {
  return useSession().data?.status === 'signed-in';
}

/** Pages of 30, newest first: `data.pages[].items`, `fetchNextPage` for «Ver más». */
export function useNotices() {
  const signedIn = useSignedIn();
  return useInfiniteQuery({
    queryKey: keys.noticeList(),
    queryFn: ({ pageParam }) => api.notices.list(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: signedIn,
  });
}

/**
 * The bell's number, live: a new or changed notification refreshes the count and the list at once. Without the
 * channel (mock, no Realtime) it falls back to asking every 60 s. 0 for a guest.
 */
export function useUnreadNotices(): number {
  const client = useQueryClient();
  const signedIn = useSignedIn();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    const stop = api.live.notices(() => invalidate(client, keys.notices()), setLive);
    return () => {
      stop();
      setLive(false);
    };
  }, [client, signedIn]);

  const query = useQuery({
    queryKey: keys.unreadNotices(),
    queryFn: () => api.notices.unreadCount(),
    enabled: signedIn,
    refetchInterval: live ? false : UNREAD_FALLBACK_MS,
  });
  return signedIn ? (query.data ?? 0) : 0;
}

type NoticeCache = { list?: InfiniteData<NoticePage, number>; unread?: number };

/** Marks the notices in the cache at once; returns what was there, to put it back on error. */
function markInCache(client: ReturnType<typeof useQueryClient>, match: (n: Notice) => boolean): NoticeCache {
  const before: NoticeCache = {
    list: client.getQueryData<InfiniteData<NoticePage, number>>(keys.noticeList()),
    unread: client.getQueryData<number>(keys.unreadNotices()),
  };
  if (before.list) {
    let newlyRead = 0;
    const pages = before.list.pages.map((page) => ({
      ...page,
      items: page.items.map((n) => {
        if (!match(n) || n.read) return n;
        newlyRead += 1;
        return { ...n, read: true };
      }),
    }));
    client.setQueryData(keys.noticeList(), { ...before.list, pages });
    if (before.unread !== undefined) client.setQueryData(keys.unreadNotices(), Math.max(0, before.unread - newlyRead));
  }
  return before;
}

function restore(client: ReturnType<typeof useQueryClient>, before: NoticeCache | undefined) {
  if (!before) return;
  if (before.list) client.setQueryData(keys.noticeList(), before.list);
  if (before.unread !== undefined) client.setQueryData(keys.unreadNotices(), before.unread);
}

/** `mutate(notice)`: marks that notice read (a grouped «Me sirvió», the whole group). */
export function useMarkNoticeRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notice: Notice) => api.notices.markRead(notice.id),
    onMutate: async (notice) => {
      await client.cancelQueries({ queryKey: keys.notices() });
      return markInCache(client, (n) => n.id === notice.id);
    },
    onError: (_error, _notice, before) => restore(client, before),
    onSettled: () => invalidate(client, keys.notices()),
  });
}

/** «Marcar todo como leído». */
export function useMarkAllNoticesRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.notices.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: keys.notices() });
      const before = markInCache(client, () => true);
      client.setQueryData(keys.unreadNotices(), 0);
      return before;
    },
    onError: (_error, _vars, before) => restore(client, before),
    onSettled: () => invalidate(client, keys.notices()),
  });
}
