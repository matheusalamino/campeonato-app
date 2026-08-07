"use client";
import { createClient } from "@/lib/supabase/client";

/** Upload a file to a registration bucket and return a usable URL. */
export async function uploadRegistrationFile(
  file: File,
  bucket: "registration-photos" | "registration-docs",
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);

  if (bucket === "registration-photos") {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  // Private bucket: store the storage path; admins read via signed URLs later.
  return `${bucket}/${path}`;
}
