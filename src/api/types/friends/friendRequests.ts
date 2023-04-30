import { PublicUser } from "../user/users";

export type FriendRequestFrom = {
  receiverId: string;
  friendRequests: FriendRequestFromBody[];
};

export type FriendRequestToResponse = {
  senderId: string;
  friendRequests: FriendRequestToBody[];
};

export type FriendRequestToBody = {
  message?: string;
  createdAt: Date;
  receiver: PublicUser;
};

export type FriendRequestFromBody = {
  message?: string;
  createdAt: Date;
  sender: PublicUser;
};

export type SendFriendRequest = {
  userId: string;
  receiverId: string;
  message?: string;
};
