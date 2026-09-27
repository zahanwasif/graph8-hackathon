import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/server/auth';
import { readJson, route } from '@/server/http';
import { setCaptureTags } from '@/server/slack/service';
import { MAX_CAPTURE_TAGS, normalizeTag } from '@/server/slack/tags';

const bodySchema = z.object({
  tags: z
    .array(
      z.string().transform((value, ctx) => {
        const tag = normalizeTag(value);
        if (!tag) {
          ctx.addIssue({
            code: 'custom',
            message: `"${value}" is not a valid hashtag. Use letters, numbers, - or _.`,
          });
          return z.NEVER;
        }
        return tag;
      }),
    )
    .min(1, 'Keep at least one hashtag')
    .max(MAX_CAPTURE_TAGS, `Use at most ${MAX_CAPTURE_TAGS} hashtags`)
    .transform((tags) => [...new Set(tags)]),
});

export const PUT = route(
  async (
    request: Request,
    ctx: RouteContext<'/api/workspaces/[workspaceId]/integrations/slack/tags'>,
  ) => {
    const { workspaceId } = await ctx.params;
    await requireAdmin(workspaceId);
    const { tags } = bodySchema.parse(await readJson(request));
    return NextResponse.json({ connection: await setCaptureTags(workspaceId, tags) });
  },
);
