'use client';

import { FileText, ImageIcon, Link2, Mic } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { CaptureListItem } from '@/lib/types/capture';

type BadgeVariant = 'success' | 'warning' | 'info' | 'secondary' | 'destructive' | 'outline';

/** Disposition is a free graph8 label; colour the ones we know, fall back to neutral. */
export function dispositionVariant(disposition: string): BadgeVariant {
  const value = disposition.toUpperCase();
  if (value.includes('STRONG') || value === 'HOT') return 'success';
  if (value.includes('MAYBE') || value === 'WARM') return 'warning';
  if (value.includes('PASS') || value === 'COLD') return 'secondary';
  return 'outline';
}

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'EXTRACTED':
    case 'RECORDED':
      return 'info';
    case 'FAILED':
      return 'destructive';
    case 'AWAITING_INFO':
    case 'AWAITING_DISAMBIGUATION':
    case 'AWAITING_APPROVAL':
      return 'warning';
    default:
      return 'secondary';
  }
}

const inputIcon = {
  VOICE: Mic,
  TEXT: FileText,
  IMAGE: ImageIcon,
  LINK: Link2,
} as const;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CaptureRow({ capture }: { capture: CaptureListItem }) {
  const Icon = inputIcon[capture.inputType] ?? FileText;
  const name = capture.personName ?? 'Unidentified contact';
  const who = [capture.personTitle, capture.personCompany].filter(Boolean).join(' @ ');
  const detail = capture.summary ?? capture.rawText ?? capture.error;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{name}</span>
          {who ? <span className="text-sm text-muted-foreground">· {who}</span> : null}
        </div>
        {detail ? <p className="line-clamp-2 text-sm text-muted-foreground">{detail}</p> : null}
        {capture.nextStep ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Next: </span>
            {capture.nextStep}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <div className="flex items-center gap-2">
          {capture.disposition ? (
            <Badge variant={dispositionVariant(capture.disposition)}>
              {capture.disposition}
              {capture.fitScore != null ? ` · ${capture.fitScore}` : ''}
            </Badge>
          ) : null}
          <Badge variant={statusVariant(capture.status)}>{capture.status}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{relativeTime(capture.createdAt)}</span>
      </div>
    </div>
  );
}
