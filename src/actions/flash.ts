"use server";

import { cookies } from "next/headers";
import { FLASH_COOKIE } from "@/lib/flash-message";

export async function clearFlashAction() {
  const cookieStore = await cookies();
  cookieStore.delete(FLASH_COOKIE);
}
