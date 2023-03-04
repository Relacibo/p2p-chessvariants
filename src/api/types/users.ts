export type User = {
  id: string;
  username: string;
  name: string;
  nickName?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  email: string;
  locale: string;
  verifiedEmail: boolean;
  picture?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  id: string;
  nickName?: string;
  picture?: string;
  createdAt: Date;
};
