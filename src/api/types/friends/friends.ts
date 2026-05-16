import { PublicUser } from "../user/users";

export type FriendEntry = {
  createdAt: string;
  friend: PublicUser;
};

export type FriendsListResponse = {
  friends: FriendEntry[];
};
