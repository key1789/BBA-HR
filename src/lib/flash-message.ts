import { cookies } from "next/headers";

export const FLASH_COOKIE = "bba_flash";
const FLASH_TTL_S = 30;

export type FlashPayload = {
  status: "success" | "error";
  message: string;
  count?: number;
};

export async function setFlashMessage(payload: FlashPayload) {
  const cookieStore = await cookies();
  cookieStore.set(FLASH_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLASH_TTL_S,
  });
}

export async function readFlashMessage(): Promise<FlashPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlashPayload;
  } catch {
    return null;
  }
}
