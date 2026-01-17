import { supabase } from './supabase'

export async function addActionLog(actionId: string, dateKey: string) {
  return supabase
    .from('action_logs')
    .insert({
      action_id: actionId,
      date_key: dateKey,
    })
}

export async function removeActionLog(actionId: string, dateKey: string) {
  return supabase
    .from('action_logs')
    .delete()
    .eq('action_id', actionId)
    .eq('date_key', dateKey)
}
