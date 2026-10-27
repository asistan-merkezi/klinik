"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cikisYap as oturumuKapat } from "@/lib/auth";

export async function cikisYap() {
  await oturumuKapat(await headers());
  redirect("/giris");
}
