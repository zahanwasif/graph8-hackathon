import { apiFetch } from '@/lib/api';
import type { CapturedMessage } from '@/lib/types/message';

export function listMessages(workspaceId: string): Promise<CapturedMessage[]> {
  return apiFetch<CapturedMessage[]>(`/workspaces/${workspaceId}/messages`);
}
