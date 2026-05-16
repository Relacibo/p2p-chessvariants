declare module 'threads' {
  export const Pool: any;
  export const Worker: any;
  export const spawn: any;
  export const Thread: any;
  export const Transfer: any;
  export const BlobWorker: any;
  export function createPool(...args: any[]): any;
}

declare module 'threads/worker' {
  export function expose(worker: any): void;
}
