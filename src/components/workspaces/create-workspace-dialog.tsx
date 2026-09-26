'use client';

import { useRouter } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form';

type CreateWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so the form's state resets between openings. */}
      {open ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              A separate space with its own members and integrations. You&rsquo;ll be its admin.
            </DialogDescription>
          </DialogHeader>
          <CreateWorkspaceForm
            onCancel={() => onOpenChange(false)}
            onCreated={() => {
              onOpenChange(false);
              router.push('/');
              router.refresh();
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
