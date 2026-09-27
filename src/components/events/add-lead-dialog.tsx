'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useAddLead } from '@/hooks/use-events';
import { ApiError } from '@/lib/api';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

type AddLeadDialogProps = {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function AddLeadForm({ eventId, onOpenChange }: { eventId: string; onOpenChange: (open: boolean) => void }) {
  const addLead = useAddLead(eventId);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasIdentifier = Boolean(
    email.trim() || firstName.trim() || lastName.trim() || companyDomain.trim(),
  );
  const canSubmit = hasIdentifier && !addLead.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const result = await addLead.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyDomain: companyDomain.trim(),
        jobTitle: jobTitle.trim(),
      });
      if (result.status === 'FAILED') {
        setError(result.error ?? "Couldn't start the intake workflow.");
        return;
      }
      toast.add({
        title: 'Lead added',
        description: 'graph8 is enriching and scoring it — watch the Leads tab.',
        type: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DialogContent>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>
            Runs this event&rsquo;s graph8 workflow — create the contact, enrich it, score it against
            the target profile, and add it to the list. Works without Slack.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="lead-email" className="text-sm font-medium">
            Work email <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="lead-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="maya.chen@example.com"
            disabled={addLead.isPending}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Best anchor for enrichment. Otherwise add a name or company.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="lead-first" className="text-sm font-medium">
              First name
            </label>
            <Input
              id="lead-first"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              maxLength={120}
              disabled={addLead.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-last" className="text-sm font-medium">
              Last name
            </label>
            <Input
              id="lead-last"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              maxLength={120}
              disabled={addLead.isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-title" className="text-sm font-medium">
            Job title
          </label>
          <Input
            id="lead-title"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            placeholder="Senior Backend Engineer"
            maxLength={200}
            disabled={addLead.isPending}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-company" className="text-sm font-medium">
            Company domain
          </label>
          <Input
            id="lead-company"
            value={companyDomain}
            onChange={(event) => setCompanyDomain(event.target.value)}
            placeholder="stripe.com"
            maxLength={255}
            disabled={addLead.isPending}
          />
          <p className="text-xs text-muted-foreground">
            The company&rsquo;s website domain — used to anchor enrichment.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addLead.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {addLead.isPending ? 'Sending…' : 'Add lead'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function AddLeadDialog({ eventId, open, onOpenChange }: AddLeadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <AddLeadForm eventId={eventId} onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}
