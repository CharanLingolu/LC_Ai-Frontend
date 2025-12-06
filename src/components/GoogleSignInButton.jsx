import { useGoogleLogin } from "@react-oauth/google";

export default function GoogleSignInButton({ onSuccess }) {
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      // tokenResponse contains an access token, can fetch user info
      onSuccess(tokenResponse);
    },
    onError: () => {
      console.error("Google login failed");
    },
  });

  return (
    <button
      onClick={() => login()}
      className="px-4 py-2 bg-red-500 text-white rounded"
    >
      Sign in with Google
    </button>
  );
}
