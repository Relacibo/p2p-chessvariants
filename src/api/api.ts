import {
  BaseQueryFn,
  createApi,
  FetchArgs,
  fetchBaseQuery,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { RootState } from "../app/store";
import {
  FriendRequestFrom as FriendRequestFromResponse,
  FriendRequestToResponse,
  SendFriendRequest as SendFriendRequestPayload,
} from "./types/friends/friendRequests";
import { FriendsListResponse } from "./types/friends/friends";
import type { PublicUser, User } from "./types/user/users";
import { LoginResponse, SigninPayload, SignupPayload } from "./types/auth/auth";
import { invalidToken } from "../features/auth/authSlice";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${import.meta.env.VITE_API_URL}/`,
  timeout: 1000,
  prepareHeaders(headers, api) {
    const state = api.getState() as RootState;
    let session = state.auth.session;
    if (session.state === "logged-in") {
      headers.set("authorization", `Bearer ${session.token}`);
      return headers;
    }
  },
});

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch(invalidToken());
  }
  return result;
};

// Define a service using a base URL and expected endpoints
export const api = createApi({
  reducerPath: "api",
  tagTypes: ["Friend", "FriendRequest"],
  baseQuery: baseQueryWithAuth,
  endpoints: (builder) => ({
    getUser: builder.query<User, string>({
      query: (user_id) => `users/${user_id}`,
    }),
    deleteUser: builder.mutation<void, string>({
      query: (user_id) => ({ url: `users/${user_id}`, method: "delete" }),
    }),
    listUsers: builder.query<PublicUser[], string | void>({
      query: (q) => ({
        url: "users",
        params: q && q.trim() ? { q: q.trim() } : undefined,
      }),
    }),
    signIn: builder.mutation<LoginResponse, SigninPayload>({
      query: (body) => ({ url: "auth/signin", method: "post", body }),
    }),
    signUp: builder.mutation<LoginResponse, SignupPayload>({
      query: (body) => ({ url: "auth/signup", method: "post", body }),
    }),
    // Outgoing friend requests (sent TO others)
    listFriendRequestsTo: builder.query<FriendRequestToResponse, string>({
      query: (userId) => `users/${userId}/friend-requests/outgoing`,
      providesTags: (_result, _error, userId) => [
        { type: "FriendRequest", id: `TO_${userId}` },
      ],
    }),
    // Incoming friend requests (FROM others)
    listFriendRequestsFrom: builder.query<FriendRequestFromResponse, string>({
      query: (userId) => `users/${userId}/friend-requests/incoming`,
      providesTags: (_result, _error, userId) => [
        { type: "FriendRequest", id: `FROM_${userId}` },
      ],
    }),
    sendFriendRequest: builder.mutation<void, SendFriendRequestPayload>({
      query: ({ userId, receiverId, message }) => ({
        url: `users/${userId}/friend-requests/send-to/${receiverId}`,
        method: "post",
        body: { message },
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: "FriendRequest", id: `TO_${userId}` },
      ],
    }),
    acceptFriendRequest: builder.mutation<
      void,
      { userId: string; senderId: string }
    >({
      query: ({ userId, senderId }) => ({
        url: `users/${userId}/friend-requests/by-sender/${senderId}/accept`,
        method: "post",
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: "FriendRequest", id: `FROM_${userId}` },
        { type: "Friend", id: userId },
      ],
    }),
    declineFriendRequest: builder.mutation<
      void,
      { userId: string; senderId: string }
    >({
      query: ({ userId, senderId }) => ({
        url: `users/${userId}/friend-requests/by-receiver/${senderId}`,
        method: "delete",
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: "FriendRequest", id: `FROM_${userId}` },
      ],
    }),
    cancelFriendRequest: builder.mutation<
      void,
      { userId: string; receiverId: string }
    >({
      query: ({ userId, receiverId }) => ({
        url: `users/${userId}/friend-requests/by-sender/${receiverId}`,
        method: "delete",
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: "FriendRequest", id: `TO_${userId}` },
      ],
    }),
    listFriends: builder.query<FriendsListResponse, string>({
      query: (userId) => `users/${userId}/friends`,
      providesTags: (_result, _error, userId) => [
        { type: "Friend", id: userId },
      ],
    }),
    removeFriend: builder.mutation<void, { userId: string; friendId: string }>({
      query: ({ userId, friendId }) => ({
        url: `users/${userId}/friends/${friendId}`,
        method: "delete",
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: "Friend", id: userId },
      ],
    }),
  }),
});

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const {
  useGetUserQuery,
  useListUsersQuery,
  useDeleteUserMutation,
  useSignInMutation,
  useSignUpMutation,
  useListFriendRequestsFromQuery,
  useListFriendRequestsToQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useCancelFriendRequestMutation,
  useListFriendsQuery,
  useRemoveFriendMutation,
} = api;
