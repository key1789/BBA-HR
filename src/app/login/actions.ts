"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function setBypassCookie() {
  const cookieStore = await cookies();
  cookieStore.set("bba_bypass_auth", "true", { path: "/" });
  redirect("/");
}
