import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
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
  }),
});

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const { useGetUserQuery, useListUsersQuery } = api;
