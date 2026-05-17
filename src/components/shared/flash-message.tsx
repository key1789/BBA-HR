"use client";

import { useEffect } from "react";
import { clearFlashAction } from "@/actions/flash";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { FlashPayload } from "@/lib/flash-message";

export function FlashMessage({ flash }: { flash: FlashPayload | null }) {
  useEffect(() => {
    if (flash) {
      clearFlashAction();
    }
  }, [flash]);

  if (!flash) return null;

  return (
    <InlineAlert
      tone={flash.status === "success" ? "success" : "error"}
      message={flash.count ? `${flash.message} (${flash.count} laporan)` : flash.message}
    />
  );
}
