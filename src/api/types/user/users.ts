export type User = {
  id: string;
  userName: string;
  avatarHash?: string;
  displayName:string;
  email: string;
  locale: string;
  verifiedEmail: boolean;
  useGravatar: boolean;
  customAvatarHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  id: string;
  userName: string;
  avatarHash?: string;
  displayName:string;
  createdAt: Date;
};
