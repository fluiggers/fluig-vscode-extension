import { ServerDTO } from "./ServerDTO";

export interface ServerConfig {
    version: String,
    permissions: undefined,
    connectedServer: ServerDTO | undefined,
    configurations: ServerDTO[]
}