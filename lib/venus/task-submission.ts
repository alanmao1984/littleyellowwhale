import { z } from 'zod'
import { taskDraftSchema } from './task-draft'
import { modelSchema } from '@/packages/node-protocol'

export const taskSubmissionSchema = taskDraftSchema.extend({
  requestId: z.string().uuid(),
  execution: z.object({ nodeId: z.string().uuid(), model: modelSchema, consent: z.literal(true) }).strict().nullable(),
}).strict()
export type TaskSubmission = z.infer<typeof taskSubmissionSchema>
