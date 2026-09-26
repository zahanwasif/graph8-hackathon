'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

type CallbackState = {
  success: string | null;
  error: string | null;
  processedParam: string | null;
};

// Module-level state for callback messages (persists across URL changes)
let callbackState: CallbackState = { success: null, error: null, processedParam: null };
const serverSnapshot: CallbackState = { success: null, error: null, processedParam: null };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CallbackState {
  return callbackState;
}

function getServerSnapshot(): CallbackState {
  return serverSnapshot;
}

function updateCallbackState(newState: Partial<CallbackState>) {
  callbackState = { ...callbackState, ...newState };
  listeners.forEach((listener) => listener());
}

/**
 * Hook to handle callback messages from URL parameters (e.g., ?connected=1)
 * Uses external store to avoid setState in effects.
 *
 * @param paramName - The URL parameter name to check (default: "connected")
 * @param successValue - The value that indicates success (default: "1")
 * @param successMessage - Message to show on success
 * @param errorMessage - Message to show on error
 */
export function useCallbackMessage(options: {
  paramName?: string;
  successValue?: string;
  successMessage?: string;
  errorMessage?: string;
}) {
  const {
    paramName = 'connected',
    successValue = '1',
    successMessage = 'Operation completed successfully.',
    errorMessage = 'Operation failed. Please try again.',
  } = options;

  const searchParams = useSearchParams();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const paramValue = searchParams.get(paramName);

  // Process the callback param synchronously during render if it's new
  // This is safe because we're updating external state, not React state
  if (paramValue !== null && paramValue !== state.processedParam) {
    if (paramValue === successValue) {
      updateCallbackState({ success: successMessage, error: null, processedParam: paramValue });
    } else {
      updateCallbackState({ success: null, error: errorMessage, processedParam: paramValue });
    }
  }

  // Clear the callback state (for use in event handlers)
  const clearCallback = useCallback(() => {
    updateCallbackState({ success: null, error: null, processedParam: null });
  }, []);

  // Derive current messages - prefer fresh param if present, otherwise use stored state
  const displaySuccess = paramValue === successValue ? successMessage : state.success;
  const displayError =
    paramValue !== null && paramValue !== successValue ? errorMessage : state.error;

  return {
    success: displaySuccess,
    error: displayError,
    clearCallback,
    hasCallbackParam: paramValue !== null,
  };
}
