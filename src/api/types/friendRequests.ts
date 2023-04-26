export type FriendRequestUserInfo = {
  userId: string;
  userName: string;
};

export type FriendRequestFrom = {
  from: FriendRequestUserInfo;
  createdAt: Date;
};

export type FriendRequestTo = {
  to: FriendRequestUserInfo;
  createdAt: Date;
};
