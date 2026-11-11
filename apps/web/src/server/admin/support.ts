import "server-only";
import type { SupportRequest } from "@fullcourt/validation";
import { createAdminClient } from "./supabase";

/**
 * Stores a support request through public.admin_submit_support_request(),
 * which only the server may call and which applies the rate limits.
 * Returns the request id, or null when the sender hit a limit.
 */
export async function insertSupportRequest(input: {
  senderKey: string;
  userId: string | null;
  request: SupportRequest;
}): Promise<string | null> {
  const { request } = input;
  const { data, error } = await createAdminClient().rpc(
    "admin_submit_support_request",
    {
      sender_key: input.senderKey,
      // The generated type says string; the function accepts null for visitors.
      sender_user: input.userId as string,
      sender_name: request.name,
      sender_email: request.email,
      request_category: request.category,
      request_subject: request.subject,
      request_message: request.message,
    },
  );
  if (error) throw error;
  return data ?? null;
}
