"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function saveMasterProductAction(prevState: any, formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("product_name") as string;

  if (!name) return { error: "Nama produk wajib diisi." };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const payload = {
    product_name: name,
    updated_at: now
  };

  let error;
  if (id) {
    const { error: updateError } = await supabase
      .from("master_products")
      .update(payload)
      .eq("id", id);
    error = updateError;
  } else {
    const { error: insertError } = await supabase
      .from("master_products")
      .insert({ ...payload, is_active: true, created_at: now });
    error = insertError;
  }

  if (error) return { error: `Gagal menyimpan produk: ${error.message}` };

  revalidatePath("/bba/products");
  revalidatePath("/bba/branches", "layout");
  return { success: true, message: "Produk berhasil disimpan!" };
}

export async function toggleProductStatusAction(id: string, currentStatus: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("master_products")
    .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `Gagal mengubah status: ${error.message}` };

  revalidatePath("/bba/products");
  return { success: true, message: `Produk berhasil di${!currentStatus ? 'aktifkan' : 'nonaktifkan'}!` };
}
