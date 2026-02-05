 // Development-only logger that suppresses sensitive logs in production
 const isDev = import.meta.env.DEV;
 
 export const logger = {
   debug: (...args: unknown[]) => isDev && console.log(...args),
   info: (...args: unknown[]) => isDev && console.info(...args),
   warn: (...args: unknown[]) => console.warn(...args),
   error: (...args: unknown[]) => console.error(...args),
 };