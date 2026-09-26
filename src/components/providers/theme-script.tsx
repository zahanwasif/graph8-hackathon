import { THEME_STORAGE_KEY } from '@/components/providers/theme-provider';

/**
 * Sets the `dark` class before first paint. Without this the page renders light and then
 * snaps to dark on hydration, which is worse than not supporting dark mode at all.
 * Kept deliberately tiny and dependency-free — it runs blocking in <head>.
 */
const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
