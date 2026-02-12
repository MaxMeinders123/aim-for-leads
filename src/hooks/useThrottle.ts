import { useCallback, useRef } from 'react';

/**
 * Hook for throttling function calls
 *
 * Ensures a function is called at most once per specified time period,
 * preventing rapid repeated calls (useful for API requests, button clicks)
 *
 * @param callback - Function to throttle
 * @param delay - Minimum time (ms) between calls
 * @returns Throttled version of the callback
 *
 * @example
 * const handleSearch = useThrottle(() => {
 *   callAPI();
 * }, 1000); // Max 1 call per second
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRun.current;

      if (timeSinceLastRun >= delay) {
        // Enough time has passed, execute immediately
        callback(...args);
        lastRun.current = now;
      } else {
        // Too soon, schedule for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastRun.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [callback, delay]
  );
}

/**
 * Hook for debouncing function calls
 *
 * Delays execution until user stops calling the function for the specified time.
 * Useful for search inputs, form validation, etc.
 *
 * @param callback - Function to debounce
 * @param delay - Wait time (ms) after last call before executing
 * @returns Debounced version of the callback
 *
 * @example
 * const handleInputChange = useDebounce((value: string) => {
 *   searchAPI(value);
 * }, 500); // Wait 500ms after user stops typing
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * Hook for rate-limited function calls with a maximum number of calls
 *
 * Prevents more than N calls within a time window
 *
 * @param callback - Function to rate limit
 * @param maxCalls - Maximum number of calls allowed
 * @param timeWindow - Time window (ms) for the limit
 * @returns Rate-limited callback and a boolean indicating if limit is reached
 *
 * @example
 * const [handleClick, isLimited] = useRateLimit(() => {
 *   sendRequest();
 * }, 10, 60000); // Max 10 calls per minute
 */
export function useRateLimit<T extends (...args: unknown[]) => unknown>(
  callback: T,
  maxCalls: number,
  timeWindow: number
): [(...args: Parameters<T>) => void, boolean] {
  const callTimestamps = useRef<number[]>([]);

  const rateLimitedCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();

      // Remove timestamps outside the time window
      callTimestamps.current = callTimestamps.current.filter(
        (timestamp) => now - timestamp < timeWindow
      );

      // Check if we've hit the rate limit
      if (callTimestamps.current.length >= maxCalls) {
        console.warn(`Rate limit reached: ${maxCalls} calls per ${timeWindow}ms`);
        return;
      }

      // Execute callback and record timestamp
      callTimestamps.current.push(now);
      callback(...args);
    },
    [callback, maxCalls, timeWindow]
  );

  const isLimited = callTimestamps.current.length >= maxCalls;

  return [rateLimitedCallback, isLimited];
}
