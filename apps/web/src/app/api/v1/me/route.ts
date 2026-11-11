import {
  DeleteAccountRequestSchema,
  DeleteAccountResponseSchema,
  ProfileSchema,
  UpdateProfileRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import {
  deleteAccount,
  getProfile,
  updateDisplayName,
} from "@/server/services/account";

/** GET /api/v1/me: the caller's profile. */
export const GET = apiRoute({
  response: ProfileSchema,
  handler: async ({ request }) => getProfile(await authenticate(request)),
});

/** PATCH /api/v1/me: change the display name. */
export const PATCH = apiRoute({
  body: UpdateProfileRequestSchema,
  response: ProfileSchema,
  handler: async ({ request, body }) =>
    updateDisplayName(await authenticate(request), body),
});

/** DELETE /api/v1/me: delete the account. Requires the current password. */
export const DELETE = apiRoute({
  body: DeleteAccountRequestSchema,
  response: DeleteAccountResponseSchema,
  handler: async ({ request, body }) => {
    await deleteAccount(await authenticate(request), body);
    return { deleted: true as const };
  },
});
