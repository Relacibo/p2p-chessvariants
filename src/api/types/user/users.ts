export type User = {
  id: string;
  userName: string;
  displayName:string;
  email: string;
  locale: string;
  verifiedEmail: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  id: string;
  userName: string;
  displayName:string;
  createdAt: Date;
};
