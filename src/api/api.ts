import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { LoginResponse, SigninPayload, SignupPayload } from "./types/google";
import type { PublicUser, User } from "./types/users";

// Define a service using a base URL and expected endpoints
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: import.meta.env.VITE_API_URL }),
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
} = api;
