"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HastaFormu } from "./hasta-formu";

export function YeniHastaDialog() {
  const [acik, setAcik] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setAcik(true)}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <UserPlus /> Yeni Hasta Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Hasta</DialogTitle>
          </DialogHeader>
          <HastaFormu />
        </DialogContent>
      </Dialog>
    </>
  );
}
