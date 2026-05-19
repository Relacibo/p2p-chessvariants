import {
  BaseQueryFn,
  createApi,
  FetchArgs,
  fetchBaseQuery,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { invalidToken, login } from "../features/auth/authSlice";
import type { RootState } from "../app/store";
import type {
  ConnectionsResponse,
  LinkPayload,
  LoginResponse,
  SigninPayload,
  SignupPayload,
  UnlinkPayload,
} from "./types/auth/auth";
import type {
  FriendRequestFrom as FriendRequestFromResponse,
  FriendRequestToResponse,
  SendFriendRequest as SendFriendRequestPayload,
} from "./types/friends/friendRequests";
import type { FriendsListResponse } from "./types/friends/friends";
import type {
  CreateLobbyPayload,
  LobbyInfo,
  LobbyPatch,
  ListLobbiesParams,
  ListLobbiesResponse,
  TurnCredentials,
} from "./types/lobby";
import type { PublicUser, User, UserListResponse } from "./types/user/users";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${import.meta.env.VITE_API_URL}/`,
  timeout: 1000,
  credentials: "include",
  prepareHeaders(headers, api) {
    const state = api.getState() as RootState;
    const session = state.auth.session;
    if (session.state === "logged-in") {
      headers.set("authorization", `Bearer ${session.token}`);
    }
    return headers;
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

export const api = createApi({
  reducerPath: "api",
  tagTypes: ["Friend", "FriendRequest", "Lobby"],
  baseQuery: baseQueryWithAuth,
  endpoints: (builder) => ({
    getUser: builder.query<User, string>({
      query: (user_id) => `users/${user_id}`,
    }),
    deleteUser: builder.mutation<void, string>({
      query: (user_id) => ({ url: `users/${user_id}`, method: "delete" }),
    }),
    listUsers: builder.query<
      UserListResponse,
      { q?: string; page?: number; limit?: number } | void
    >({
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
    listLobbies: builder.query<ListLobbiesResponse, ListLobbiesParams | void>({
      query: (params) => ({ url: "lobby", params: params || undefined }),
      providesTags: ["Lobby"],
    }),
    createLobby: builder.mutation<{ lobbyId: string }, CreateLobbyPayload>({
      query: (body) => ({ url: "lobby", method: "POST", body }),
      invalidatesTags: ["Lobby"],
    }),
    getLobby: builder.query<LobbyInfo, string>({
      query: (id) => `lobby/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Lobby" as const, id }],
    }),
    deleteLobby: builder.mutation<void, string>({
      query: (id) => ({ url: `lobby/${id}`, method: "DELETE" }),
      invalidatesTags: ["Lobby"],
    }),
    patchLobby: builder.mutation<void, { id: string; patch: LobbyPatch }>({
      query: ({ id, patch }) => ({
        url: `lobby/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Lobby" as const, id },
        "Lobby",
      ],
    }),
    heartbeat: builder.mutation<void, string>({
      query: (id) => ({ url: `lobby/${id}/heartbeat`, method: "POST" }),
    }),
    sendSignal: builder.mutation<
      void,
      { lobbyId: string; toUserId: string; signal: object }
    >({
      query: ({ lobbyId, toUserId, signal }) => ({
        url: `lobby/${lobbyId}/signal`,
        method: "POST",
        body: { toUserId, signal },
      }),
    }),
    sendSignalDirect: builder.mutation<
      void,
      { toUserId: string; signal: object }
    >({
      query: ({ toUserId, signal }) => ({
        url: `signal/${toUserId}`,
        method: "POST",
        body: { signal },
      }),
    }),
    getTurnCredentials: builder.query<RTCIceServer[], void>({
      query: () => "turn-credentials",
      keepUnusedDataFor: 3600,
      transformResponse: (creds: TurnCredentials) => {
        const servers: RTCIceServer[] = [];
        for (const url of creds.urls) {
          servers.push({
            urls: url,
            username: creds.username,
            credential: creds.credential,
          });
          if (url.startsWith("turn:") && !url.includes("?transport=")) {
            servers.push({
              urls: url + "?transport=tcp",
              username: creds.username,
              credential: creds.credential,
            });
          }
        }
        return servers;
      },
    }),
    signIn: builder.mutation<LoginResponse, SigninPayload>({
      query: (body) => ({ url: "auth/signin", method: "post", body }),
    }),
    signUp: builder.mutation<LoginResponse, SignupPayload>({
      query: (body) => ({ url: "auth/signup", method: "post", body }),
    }),
    guestLogin: builder.mutation<
      LoginResponse & { result: "success" },
      { displayName: string }
    >({
      query: (body) => ({
        url: "auth/guest",
        method: "post",
        body,
      }),
    }),
    updateUser: builder.mutation<
      User,
      { useGravatar: boolean; customGravatarEmail?: string | null }
    >({
      query: (body) => ({
        url: "users/me",
        method: "PATCH",
        body,
      }),
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
    listFriendRequestsTo: builder.query<FriendRequestToResponse, string>({
      query: (userId) => `users/${userId}/friend-requests/outgoing`,
      providesTags: (_result, _error, userId) => [
        { type: "FriendRequest", id: `TO_${userId}` },
      ],
    }),
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

export const {
  useGetUserQuery,
  useListUsersQuery,
  useListUsersByIdsQuery,
  useDeleteUserMutation,
  useListLobbiesQuery,
  useGetLobbyQuery,
  useCreateLobbyMutation,
  useDeleteLobbyMutation,
  usePatchLobbyMutation,
  useHeartbeatMutation,
  useSendSignalMutation,
  useSendSignalDirectMutation,
  useGetTurnCredentialsQuery,
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
