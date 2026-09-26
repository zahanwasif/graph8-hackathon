/**
 * Clerk renders its own DOM inside a shadow-ish scope, so none of the app's Tailwind utilities
 * reach it. `variables` is the supported hook for handing it our tokens; without this the
 * sign-in pages and the sidebar widgets keep Clerk's stock palette and read as a different
 * product. Values are CSS vars, so they follow light/dark automatically.
 */
const base = {
  colorPrimary: 'var(--primary)',
  colorTextSecondary: 'var(--muted-foreground)',
  colorInputBackground: 'var(--muted)',
  colorInputText: 'var(--foreground)',
  colorDanger: 'var(--destructive)',
  colorSuccess: 'var(--success)',
  colorWarning: 'var(--warning)',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-sans)',
} as const;

/** For the `<SignIn>` / `<SignUp>` cards, which sit on the app canvas. */
export const clerkAuthAppearance = {
  variables: {
    ...base,
    colorText: 'var(--foreground)',
    colorBackground: 'var(--card)',
  },
} as const;

/** For `<UserButton>` / `<OrganizationSwitcher>`, which sit on the sidebar surface. */
export const clerkSidebarAppearance = {
  variables: {
    ...base,
    colorText: 'var(--sidebar-foreground)',
    colorBackground: 'var(--sidebar)',
  },
} as const;
