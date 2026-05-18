import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login, selectClaims } from "./authSlice";

/**
 * Silently refreshes the access token 5 minutes before it expires.
 * Relies on the HTTP-only refresh token cookie being sent automatically.
 */
export function useTokenRefresh() {
  const dispatch = useDispatch();
  const claims = useSelector(selectClaims);

  useEffect(() => {
    if (!claims) return;

    const expiresAtMs = claims.exp * 1000;
    const refreshAtMs = expiresAtMs - 5 * 60 * 1000;
    const delay = refreshAtMs - Date.now();

    if (delay <= 0) return; // already past or within 5-min window; let the 401 handler cover it

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          dispatch(login({ token: data.token, user: data.user }));
        }
        // If refresh fails, we leave it to the 401 retry in baseQueryWithAuth
      } catch {
        // Network error – will surface when the next API request fails
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [claims, dispatch]);
}
