import { createHandler, supabase, type UserRole, errorResponse } from './_shared/handler'

// Fine-grained role checks for evaluations
function canViewAllEvaluations(role: UserRole): boolean {
  return ['admin', 'executive', 'evaluator'].includes(role)
}
function canCreateEvaluations(role: UserRole): boolean {
  return ['admin', 'executive', 'evaluator'].includes(role)
}
function canModifyEvaluations(role: UserRole): boolean {
  return ['admin', 'executive'].includes(role)
}

const EVAL_SELECT = `
  *,
  member:members!member_id(id, name, email),
  evaluator:members!evaluator_id(id, name, email)
`

export const handler = createHandler({
  name: 'evaluations',
  auth: 'authenticated',
  handler: async ({ event, logger, user }) => {
    const userRole = user!.role
    const userEmail = user!.email

    switch (event.httpMethod) {
      case 'GET': {
        const { member_id, evaluator_id, id } = event.queryStringParameters || {}

        if (id) {
          const { data, error } = await supabase
            .from('evaluations')
            .select(EVAL_SELECT)
            .eq('id', id)
            .maybeSingle()

          if (error) throw error

          // Existence-oracle fix: a non-existent id and an id belonging to
          // another member must look identical to an unprivileged caller.
          // Both return 404 "Not found".
          if (!data) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) }
          }

          if (!canViewAllEvaluations(userRole)) {
            const { data: memberData } = await supabase
              .from('members')
              .select('id')
              .eq('user_id', user!.id)
              .single()

            if (!memberData || data.member_id !== memberData.id) {
              // Unified 404 (not 403) avoids leaking whether the
              // evaluation id exists. See evaluations.test.ts.
              return errorResponse({
                code: 'not_found',
                message: 'Not found.',
              })
            }
          }

          return { statusCode: 200, body: JSON.stringify(data) }
        }

        if (member_id) {
          if (!canViewAllEvaluations(userRole)) {
            const { data: memberData } = await supabase
              .from('members')
              .select('id')
              .eq('user_id', user!.id)
              .maybeSingle()

            // No members row for this user_id → they have no evaluations.
            // Return an empty list so the UX matches "official with row but
            // no evaluations" (avoids the misleading 403 message).
            if (!memberData) {
              return { statusCode: 200, body: JSON.stringify([]) }
            }
            if (member_id !== memberData.id) {
              return errorResponse({
                code: 'forbidden',
                message: 'You can only view your own evaluations.',
              })
            }
          }

          const { data, error } = await supabase
            .from('evaluations')
            .select(EVAL_SELECT)
            .eq('member_id', member_id)
            .order('evaluation_date', { ascending: false })

          if (error) throw error
          return { statusCode: 200, body: JSON.stringify(data) }
        }

        if (evaluator_id) {
          if (!canViewAllEvaluations(userRole)) {
            return errorResponse({
            code: 'forbidden',
            message: 'Forbidden - Insufficient permissions.'.replace('..', '.'),
          })
          }

          const { data, error } = await supabase
            .from('evaluations')
            .select(EVAL_SELECT)
            .eq('evaluator_id', evaluator_id)
            .order('evaluation_date', { ascending: false })

          if (error) throw error
          return { statusCode: 200, body: JSON.stringify(data) }
        }

        if (!canViewAllEvaluations(userRole)) {
          return errorResponse({
            code: 'forbidden',
            message: 'Forbidden - You can only view your own evaluations.'.replace('..', '.'),
          })
        }

        const { data, error } = await supabase
          .from('evaluations')
          .select(EVAL_SELECT)
          .order('evaluation_date', { ascending: false })

        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        if (!canCreateEvaluations(userRole)) {
          return errorResponse({
            code: 'forbidden',
            message: 'Forbidden - You do not have permission to create evaluations.'.replace('..', '.'),
          })
        }

        const body = JSON.parse(event.body || '{}')
        logger.info('crud', 'create_evaluation', `Creating evaluation for member ${body.member_id} by ${userEmail} (${userRole})`, {
          metadata: { member_id: body.member_id, evaluator_id: body.evaluator_id, title: body.title, actor_role: userRole }
        })

        if (!body.member_id || !body.file_url || !body.file_name) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A member, file URL, and file name are all required.',
          })
        }

        const { data, error } = await supabase
          .from('evaluations')
          .insert([{
            member_id: body.member_id,
            evaluator_id: body.evaluator_id,
            evaluation_date: body.evaluation_date || new Date().toISOString().split('T')[0],
            file_url: body.file_url,
            file_name: body.file_name,
            title: body.title,
            notes: body.notes,
            activity_id: body.activity_id
          }])
          .select(EVAL_SELECT)
          .single()

        if (error) throw error

        await logger.audit('CREATE', 'evaluation', data.id, {
          actorId: body.evaluator_id || user!.id,
          actorEmail: userEmail,
          targetUserId: body.member_id,
          newValues: { title: body.title, file_name: body.file_name },
          description: `Created evaluation for member ${body.member_id} by ${userEmail} (${userRole})`
        })

        return { statusCode: 201, body: JSON.stringify(data) }
      }

      case 'PUT': {
        // Note: the role gate runs *after* id validation and inside an
        // evaluator carve-out below — admin/executive bypass it, an
        // evaluator may edit their own creation. See further down.
        const body = JSON.parse(event.body || '{}')
        const { id, ...updateData } = body

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A record must be selected for update.',
          })
        }

        // Carve-out: an evaluator may modify an evaluation whose
        // evaluator_id matches their own member.id (FK to members.id, not
        // user_id). Admin/executive bypass this check entirely.
        if (!canModifyEvaluations(userRole)) {
          if (userRole !== 'evaluator') {
            return errorResponse({
              code: 'forbidden',
              message: 'Only administrators and executives can edit evaluations.',
            })
          }

          const { data: existing, error: existingError } = await supabase
            .from('evaluations')
            .select('evaluator_id')
            .eq('id', id)
            .maybeSingle()

          if (existingError) throw existingError
          if (!existing) {
            return errorResponse({
              code: 'not_found',
              message: 'Not found.',
            })
          }

          const { data: memberData } = await supabase
            .from('members')
            .select('id')
            .eq('user_id', user!.id)
            .maybeSingle()

          if (!memberData || existing.evaluator_id !== memberData.id) {
            return errorResponse({
              code: 'forbidden',
              message: 'Evaluators can only edit evaluations they authored.',
            })
          }
        }

        logger.info('crud', 'update_evaluation', `Updating evaluation ${id} by ${userEmail} (${userRole})`, {
          metadata: { id, updates: Object.keys(updateData), actor_role: userRole }
        })

        const { data, error } = await supabase
          .from('evaluations')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select(EVAL_SELECT)
          .single()

        if (error) throw error

        await logger.audit('UPDATE', 'evaluation', id, {
          actorId: user!.id,
          actorEmail: userEmail,
          newValues: updateData,
          description: `Updated evaluation ${id} by ${userEmail} (${userRole})`
        })

        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'DELETE': {
        if (!canModifyEvaluations(userRole)) {
          return errorResponse({
            code: 'forbidden',
            message: 'Forbidden - Only administrators and executives can delete evaluations.'.replace('..', '.'),
          })
        }

        const { id } = event.queryStringParameters || {}

        if (!id) {
          return errorResponse({
            code: 'invalid_input',
            message: 'A record must be selected for deletion.',
          })
        }

        logger.info('crud', 'delete_evaluation', `Deleting evaluation ${id} by ${userEmail} (${userRole})`, { metadata: { id, actor_role: userRole } })

        const { error } = await supabase
          .from('evaluations')
          .delete()
          .eq('id', id)

        if (error) throw error

        await logger.audit('DELETE', 'evaluation', id, {
          actorId: user!.id,
          actorEmail: userEmail,
          description: `Deleted evaluation ${id} by ${userEmail} (${userRole})`
        })

        return { statusCode: 204, body: '' }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  }
})
