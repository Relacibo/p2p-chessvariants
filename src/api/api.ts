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
import type { PublicUser, User, UserListResponse } from "./types/user/users";
import {
  ConnectionsResponse,
  LinkPayload,
  LoginResponse,
  SigninPayload,
  SignupPayload,
  UnlinkPayload,
} from "./types/auth/auth";
import { invalidToken, login } from "../features/auth/authSlice";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${import.meta.env.VITE_API_URL}/`,
  timeout: 1000,
  credentials: "include",
  prepareHeaders(headers, api) {
    const state = api.getState() as RootState;
    let session = state.auth.session;
    if (session.state === "logged-in") {
      headers.set("authorization", `Bearer ${session.token}`);
      return headers;
    }
  },
});

let isRefreshing = false;

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      const refreshResult = await rawBaseQuery(
        { url: "auth/refresh", method: "POST" },
        api,
        extraOptions,
      );
      if (refreshResult.data) {
        const { token, user } = refreshResult.data as {
          token: string;
          user: User;
        };
        api.dispatch(login({ token, user }));
        // Retry the original request with the new access token
        result = await rawBaseQuery(args, api, extraOptions);
      } else {
        api.dispatch(invalidToken());
      }
    } finally {
      isRefreshing = false;
    }
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
    listUsers: builder.query<UserListResponse, { q?: string; page?: number; limit?: number } | void>({
      query: (params) => ({
        url: "users",
        params: params || undefined,
      }),
    }),
    listUsersByIds: builder.query<UserListResponse, string[]>({
      query: (ids) => ({
        url: "users",
        params: ids.length ? { ids: ids.join(",") } : undefined,
      }),
    }),

    signIn: builder.mutation<LoginResponse, SigninPayload>({
      query: (body) => ({ url: "auth/signin", method: "post", body }),
    }),
    signUp: builder.mutation<LoginResponse, SignupPayload>({
      query: (body) => ({ url: "auth/signup", method: "post", body }),
    }),
    guestLogin: builder.mutation<LoginResponse & { result: "success" }, { displayName: string }>({
      query: (body) => ({
        url: "auth/guest",
        method: "post",
        body,
      }),
    }),
    updateUser: builder.mutation<User, { useGravatar: boolean; customGravatarEmail?: string | null }>({
      query: (body) => ({
        url: "users/me",
        method: "put",
        body,
      }),
      // We could invalidate user, but the user is currently stored in authSlice not API slice.
      // Easiest is to let the user re-login or reload to see the effect instantly, 
      // or we can optimistically update authSlice.
    }),
    serverLogout: builder.mutation<void, void>({
      query: () => ({ url: "auth/logout", method: "post" }),
    }),
    getConnections: builder.query<ConnectionsResponse, void>({
      query: () => "auth/connections",
    }),
    linkProvider: builder.mutation<void, LinkPayload>({
      query: (body) => ({ url: "auth/link", method: "post", body }),
    }),
    unlinkProvider: builder.mutation<void, UnlinkPayload>({
      query: (body) => ({ url: "auth/unlink", method: "post", body }),
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
  useListUsersByIdsQuery,
  useDeleteUserMutation,
  useSignInMutation,
      useUpdateUserMutation,
  useGuestLoginMutation,
  useSignUpMutation,
  useServerLogoutMutation,
  useGetConnectionsQuery,
  useLinkProviderMutation,
  useUnlinkProviderMutation,
  useListFriendRequestsFromQuery,
  useListFriendRequestsToQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useCancelFriendRequestMutation,
  useListFriendsQuery,
  useRemoveFriendMutation,
} = api;
