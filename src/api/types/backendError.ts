export type BackendError = {
  status: number;
  data?: {
    error?: string;
  };
};
