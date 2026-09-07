import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

type GoogleTokenInput = {
  credential: string;
};

type GoogleProfile = {
  name: string;
  email: string;
};

export const verifyGoogleToken = createServerFn({ method: "POST" })
  .validator((data: GoogleTokenInput) => data)
  .handler(async ({ data }): Promise<GoogleProfile | null> => {
    try {
      const clientId = env.GOOGLE_CLIENT_ID;
      if (!clientId) return null;

      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(data.credential)}`,
      );
      if (!response.ok) return null;

      const token = (await response.json()) as {
        aud?: string;
        email?: string;
        email_verified?: string;
        name?: string;
      };
      if (token.aud !== clientId || token.email_verified !== "true" || !token.email) {
        return null;
      }

      return {
        name: token.name?.trim() || token.email.split("@")[0] || "Google user",
        email: token.email.toLowerCase(),
      };
    } catch (error) {
      console.warn("Google sign-in verification failed.", error);
      return null;
    }
  });
