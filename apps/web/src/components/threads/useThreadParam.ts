import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMessageStore } from '../../stores/messages';
import { useThreadStore } from '../../stores/threads';
import { useViewStore } from '../../stores/view';

/**
 * Deep link `?thread=<id>[&m=<messageId>]` on a parent channel / forum: opens the thread panel (and jumps to the message).
 * Call before other `?m=` handlers so they don't see a thread message id.
 */
export function useThreadParam(parentId: string) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const threadId = params.get('thread');
    if (!threadId) return;
    useThreadStore.getState().open(parentId, threadId);
    const mid = params.get('m');
    if (mid) void useMessageStore.getState().jumpTo(threadId, mid);
    params.delete('thread');
    params.delete('m');
    setParams(params, { replace: true });
  }, [params, setParams, parentId]);

  // leaving the channel closes its thread panel (checked after the route settles, so remounts keep it)
  useEffect(() => () => {
    setTimeout(() => {
      if (useViewStore.getState().channelId !== parentId && useThreadStore.getState().panel?.parentId === parentId) {
        useThreadStore.getState().close();
      }
    }, 0);
  }, [parentId]);
}
