/**
 * The integrations catalogue.
 *
 * A descriptor registry rather than markup in the page — adding an integration is a new entry
 * here plus a logo in `components/integrations/logos`, not a new card component.
 */

export type IntegrationKey = 'slack';

export type IntegrationCategory = 'Messaging';

export interface IntegrationDescriptor {
  key: IntegrationKey;
  name: string;
  category: IntegrationCategory;
  /** One line, said in terms of what it does for the workspace — not what the vendor is. */
  description: string;
}

export const INTEGRATION_DESCRIPTORS: Record<IntegrationKey, IntegrationDescriptor> = {
  slack: {
    key: 'slack',
    name: 'Slack',
    category: 'Messaging',
    description: 'Connect a Slack channel so this workspace can post updates where your team talks.',
  },
};

export const INTEGRATION_LIST: IntegrationDescriptor[] = [INTEGRATION_DESCRIPTORS.slack];
