import { useGoogleLogin } from "@react-oauth/google";
import { API_URL, GOOGLE_REDIRECT_URI } from "../../constants/env.ts";
import { useQueryClient } from "@tanstack/react-query";

export function useGoogleAuthEntry() {
  const queryClient = useQueryClient();

  return useGoogleLogin({
    flow: "implicit",
    ux_mode: "popup",
    redirect_uri: GOOGLE_REDIRECT_URI,
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch(`${API_URL}/api/auth/google-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenResponse.access_token }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message =
            err?.error ??
            "Login failed. Please use your BITS Pilani email (goa/pilani/hyderabad/dubai).";
          alert(message);
          localStorage.removeItem("jwt");
          window.location.href = "/";
          return;
        }

        const data = await res.json();
        console.log("User authenticated with data: " + JSON.stringify(data));
        localStorage.setItem("jwt", data.token);
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        window.location.href = "/home";
      } catch (err) {
        console.error("Login error:", err);
      }
    },
    onError: () => {
      console.error("Google login failed");
    },
  });
}
