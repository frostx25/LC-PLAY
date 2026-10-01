import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.infer<TSchema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw new BadRequestException({
    message: "Verifique os dados informados.",
    issues: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

