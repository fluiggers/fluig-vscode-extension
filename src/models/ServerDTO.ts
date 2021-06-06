export interface ServerDTO {
    id: string | undefined;
    name: string;
    host: string;
    ssl: boolean;
    port: number;
    username: string;
    password: string;
    confirmExporting: boolean;
    companyId: number;
}
