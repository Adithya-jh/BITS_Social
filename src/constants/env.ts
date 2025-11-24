const FALLBACK_API_URL = "https://bits-social-bc.onrender.com";
const FALLBACK_GOOGLE_CLIENT_ID =
  "928935602170-9kbeop4lt8mfr0vn2p2jmqqi2da990a6.apps.googleusercontent.com";

export const API_URL = import.meta.env.VITE_API_URL || FALLBACK_API_URL;
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || FALLBACK_GOOGLE_CLIENT_ID;
export const GOOGLE_REDIRECT_URI =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI || "postmessage";
