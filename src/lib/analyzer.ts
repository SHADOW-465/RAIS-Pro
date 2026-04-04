import { supabase } from './supabase'
import { SheetSummary } from './parser'

export async function runAnalysis(summaries: SheetSummary[]): Promise<any> {
    const { data, error } = await supabase.functions.invoke('analyze', {
        body: { summaries }
    })

    if (error) {
        console.error('Analysis failed:', error)
        throw new Error('Analysis engine failure')
    }

    return data
}
