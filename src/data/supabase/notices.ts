// Avisos of the Supabase adapter (SPEC 22, wiki #214): the SQL functions of 0010 build every notice, group the
// «Me sirvió» of a letrero and mark read; RLS and `current_profile_id()` keep each person to their own rows.
import type { DataApi } from '../api';
import type { NoticePage } from '../types';
import { rpc } from './rpc';

export const supabaseNotices: DataApi['notices'] = {
  list: (offset = 0) => rpc<NoticePage>('my_notifications', { p_offset: offset }),
  unreadCount: () => rpc<number>('my_unread_notices'),
  markRead: (id) => rpc<void>('mark_notice_read', { p_id: id }),
  markAllRead: () => rpc<void>('mark_all_notices_read'),
};
