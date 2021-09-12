import { Transform } from 'stream'

declare class Request {
    public send(pageHandler: Function): void;
}

interface S3PagingStreamOptions {
    read: Function
    objectMode: boolean
}

export default function (request: Request, callback: Function, options: S3PagingStreamOptions): Transform