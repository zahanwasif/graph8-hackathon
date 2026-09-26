import type { ComponentType, SVGProps } from 'react';

import type { IntegrationKey } from '@/lib/integrations/catalog';

/**
 * Brand marks for the integrations catalogue.
 *
 * **These are the one place in app code allowed to carry a raw hex colour.** THEME.md's rule
 * exists to stop palette drift in app chrome, and it should be obeyed everywhere else — but a
 * brand mark is not chrome. Slack's four colours *are* the asset: tokenising them would put
 * them in the theme's hands, and re-theming them in dark mode would render them wrong. Every
 * literal stays inside this file.
 *
 * Inline components rather than files in `public/`, so a logo takes `className` for sizing
 * without an image loader.
 */

type LogoProps = SVGProps<SVGSVGElement>;

/** The Slack hash mark: four rounded bars, each ending in a dot, one per brand colour. */
export function SlackLogo({ className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 122.8 122.8"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Slack"
      className={className}
      {...props}
    >
      <path
        fill="#E01E5A"
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
      />
      <path
        fill="#36C5F0"
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
      />
      <path
        fill="#2EB67D"
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
      />
      <path
        fill="#ECB22E"
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
      />
    </svg>
  );
}

export const INTEGRATION_LOGOS: Record<IntegrationKey, ComponentType<LogoProps>> = {
  slack: SlackLogo,
};
