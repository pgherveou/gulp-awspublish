import { Transform } from 'stream'

export interface LogReporterOptions {
    states: string[]
}

export default function (options?: LogReporterOptions): Transform