import { useEffect, useState } from 'react';
import { getSyncStatus, retryUploads, subscribeSync } from '../replay/sync.ts';
export function CloudStatus({ id }: { id?: string }) {
  const [status, setStatus] = useState(() => getSyncStatus(id || ''));
  useEffect(() => {
    const update = () => setStatus(getSyncStatus(id || ''));
    update();
    return subscribeSync(update);
  }, [id]);
  if (!id) return null;
  return (
    <div className={`cloud-status ${status.kind}`} role="status">
      <span>{status.text}</span>
      {status.kind === 'error' && (
        <button className="text-button" onClick={retryUploads}>
          重试上传
        </button>
      )}
      <small>已确认行动自动上传，对局结束后公开回放。</small>
    </div>
  );
}
