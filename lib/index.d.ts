import { Transform } from 'stream'
import { LogReporterOptions } from './log-reporter';

interface CacheOptions {
    cacheFileName?: string
}

interface Params {
    Bucket: string
}

interface Credentials {
    accessKeyId: string
    secretAccessKey: string
    signatureVersion: string
}

interface AWSConfig {
    region: string
    credentials: Credentials
    params: Params
}

interface PublishOptions {
    noAcl: boolean
    force: boolean
    simulate: boolean
    createOnly: boolean
}

interface Headers {
    [name: string]: string
}

declare class Publisher {
    constructor(awsConfig: AWSConfig, cacheOptions?: CacheOptions);
    public publish(headers?: Headers, options?: PublishOptions): Transform;
    public reporter(options?: LogReporterOptions): Transform;
    public cache(): Transform;
}

export function create(awsConfig: AWSConfig, cacheOptions?: CacheOptions): Publisher