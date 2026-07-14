import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2).max(100),
});

export type SignInPayload = z.infer<typeof signInSchema>;
export type SignUpPayload = z.infer<typeof signUpSchema>;
