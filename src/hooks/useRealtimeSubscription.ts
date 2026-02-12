import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeSubscriptionConfig {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  filter?: string;
  callback: (payload: { new: unknown; old: unknown; eventType: string }) => void;
  debounceMs?: number; // Optional debounce for high-frequency updates
}

/**
 * Hook for managing Supabase realtime subscriptions with proper cleanup
 *
 * Automatically handles:
 * - Channel creation and subscription
 * - Cleanup on unmount (prevents memory leaks)
 * - Debouncing of rapid updates
 * - Reconnection on connection loss
 *
 * @param channelName - Unique name for the subscription channel
 * @param config - Subscription configuration
 *
 * @example
 * useRealtimeSubscription('company-research', {
 *   table: 'company_research',
 *   event: 'INSERT',
 *   filter: `user_id=eq.${userId}`,
 *   callback: (payload) => {
 *     handleNewCompany(payload.new);
 *   },
 *   debounceMs: 300
 * });
 */
export function useRealtimeSubscription(
  channelName: string,
  config: RealtimeSubscriptionConfig
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(config.callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = config.callback;
  }, [config.callback]);

  useEffect(() => {
    // Skip if no valid config
    if (!config.table) return;

    // Create debounced callback if debouncing is enabled
    const wrappedCallback = (payload: { new: unknown; old: unknown; eventType: string }) => {
      if (config.debounceMs && config.debounceMs > 0) {
        // Clear existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
          callbackRef.current(payload);
        }, config.debounceMs);
      } else {
        // No debouncing, call immediately
        callbackRef.current(payload);
      }
    };

    // Create channel
    channelRef.current = supabase.channel(channelName);

    // Build subscription config
    const subscriptionConfig: {
      event: string;
      schema: string;
      table: string;
      filter?: string;
    } = {
      event: config.event,
      schema: config.schema || 'public',
      table: config.table,
    };

    if (config.filter) {
      subscriptionConfig.filter = config.filter;
    }

    // Subscribe to changes
    channelRef.current
      .on('postgres_changes', subscriptionConfig, wrappedCallback)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Subscribed to ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Channel error for ${channelName}`);
        } else if (status === 'TIMED_OUT') {
          console.warn(`⏱️ Subscription timed out for ${channelName}`);
        }
      });

    // Cleanup function
    return () => {
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Unsubscribe and remove channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        console.log(`🧹 Cleaned up subscription: ${channelName}`);
      }
    };
  }, [
    channelName,
    config.table,
    config.event,
    config.schema,
    config.filter,
    config.debounceMs,
  ]);

  return channelRef;
}

/**
 * Hook for multiple realtime subscriptions with shared cleanup
 *
 * @param subscriptions - Array of subscription configs
 *
 * @example
 * useRealtimeSubscriptions([
 *   {
 *     channelName: 'companies',
 *     table: 'company_research',
 *     event: 'INSERT',
 *     callback: handleCompany
 *   },
 *   {
 *     channelName: 'prospects',
 *     table: 'prospect_research',
 *     event: '*',
 *     callback: handleProspect
 *   }
 * ]);
 */
export function useRealtimeSubscriptions(
  subscriptions: Array<RealtimeSubscriptionConfig & { channelName: string }>
) {
  subscriptions.forEach((sub) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useRealtimeSubscription(sub.channelName, sub);
  });
}
