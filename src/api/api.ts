import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { RootState } from "../app/store";
import {
  LoginResponse,
  SigninPayload,
  SignupPayload,
} from "./types/auth/google";
import {
  FriendRequestFrom as FriendRequestFromResponse,
  FriendRequestToResponse,
  SendFriendRequest as SendFriendRequestPayload,
} from "./types/friends/friendRequests";
import type { PublicUser, User } from "./types/user/users";

// Define a service using a base URL and expected endpoints
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL,
    timeout: 1000,
    prepareHeaders(headers, api) {
      const state = api.getState() as RootState;
      let session = state.auth.session;
      if (session.state === "logged-in") {
        headers.set("authorization", `Bearer ${session.token}`);
        return headers;
      }
    },
  }),
  endpoints: (builder) => ({
    getUser: builder.query<User, string>({
      query: (user_id) => `users/${user_id}`,
    }),
    deleteUser: builder.mutation<void, string>({
      query: (user_id) => ({ url: `users/${user_id}`, method: "delete" }),
    }),
    listUsers: builder.query<PublicUser[], void>({
      query: () => ({ url: "users" }),
    }),
    signInWithGoogle: builder.mutation<LoginResponse, SigninPayload>({
      query: (body) => ({ url: "auth/google/signin", method: "post", body }),
    }),
    signUpWithGoogle: builder.mutation<LoginResponse, SignupPayload>({
      query: (body) => ({ url: "auth/google/signup", method: "post", body }),
    }),
    listFriendRequestsTo: builder.query<FriendRequestToResponse, string>({
      query: (userId) => `users/${userId}/friend-requests/outgoing`,
    }),
    listFriendRequestsFrom: builder.query<FriendRequestFromResponse, string>({
      query: (userId) => `users/${userId}/friend-requests/incoming`,
    }),
    sendFriendRequest: builder.mutation<void, SendFriendRequestPayload>({
      query: (body) => {
        const { userId, receiverId, message } = body;
        return {
          url: `users/${userId}/friends-requests/send-to/${receiverId}`,
          method: "post",
          body: {
            message,
          },
        };
      },
    }),
  }),
});

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const {
  useGetUserQuery,
  useListUsersQuery,
  useDeleteUserMutation,
  useSignInWithGoogleMutation,
  useSignUpWithGoogleMutation,
  useListFriendRequestsFromQuery,
  useListFriendRequestsToQuery,
} = api;
